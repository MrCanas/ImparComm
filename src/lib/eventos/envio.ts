/**
 * Motor de envío. Lo invoca la consola (una pestaña del navegador) una vez por
 * correo: si la pestaña se cierra, el envío se detiene. Toda la seguridad de
 * concurrencia, ritmo, tope diario y duplicados vive en la base
 * (crm.envio_reservar_siguiente / crm.envio_resultado, migración 009); aquí se
 * genera el correo con la versión VIGENTE de la plantilla y se envía. SOLO servidor.
 */
import type { CrmClient } from "@/lib/db/server";
import { sendGraphMime } from "@/lib/email/mailer";

import { decidir } from "./decision";
import { enlacesInvitado } from "./enlaces";
import { comprobarDestino, esDireccionDePrueba } from "./guardas";
import { generarIcs } from "./ics";
import { construirMime } from "./mime";
import { generarCorreo, MAX_BYTES } from "./render/render";
import type { Bloque, ContextoCorreo, Marca } from "./render/tipos";

export type PasoEnvio =
  | { status: "ok"; invitadoId: string; email: string; resultado: "enviado" | "error" | "incierto"; error: string | null; pausado: string | null; ms: number }
  | { status: "espera"; esperaMs: number }
  | { status: "candado" | "no_activo" | "tope" | "incierto" | "completado"; detalle?: string | null };

interface FilaEvento {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  lugar: string | null;
  direccion: string | null;
  mapa_url: string | null;
  remitente: string | null;
  remitente_nombre: string;
  reply_to: string | null;
  ics_uid: string;
  ics_sequence: number;
}

interface FilaPlantilla {
  id: string;
  asunto: string;
  preheader: string | null;
  modo: "bloques" | "html";
  bloques: Bloque[];
  html: string | null;
  adjuntar_ics: boolean;
  version: number;
}

interface FilaInvitado {
  id: string;
  email: string;
  nombre: string | null;
  empresa: string | null;
  cargo: string | null;
}

function remitentePorDefecto(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) throw new Error("Falta EMAIL_FROM (buzón remitente).");
  return from;
}

/** Monta el MIME completo de un invitado (lo mismo para envíos reales y de prueba). */
export function montarCorreo(
  evento: FilaEvento,
  plantilla: FilaPlantilla,
  invitado: FilaInvitado,
  marca: Partial<Marca>,
  destinoReal: string = invitado.email,
): { mime: string; asunto: string; bytes: number } {
  const enlaces = enlacesInvitado(invitado.id);
  const ctx: ContextoCorreo = {
    invitado: { nombre: invitado.nombre, empresa: invitado.empresa, cargo: invitado.cargo, email: invitado.email },
    evento: {
      nombre: evento.nombre,
      inicio: new Date(evento.inicio),
      fin: new Date(evento.fin),
      lugar: evento.lugar,
      direccion: evento.direccion,
      mapaUrl: evento.mapa_url,
    },
    enlaces,
  };
  const correo = generarCorreo(plantilla, ctx, marca);
  if (correo.bytes > MAX_BYTES) throw new Error(`El correo pesa ${Math.round(correo.bytes / 1024)} KB (máximo 100 KB).`);
  const remitente = evento.remitente || remitentePorDefecto();
  const ics = plantilla.adjuntar_ics
    ? generarIcs({
        metodo: "REQUEST",
        uidEvento: evento.ics_uid,
        invitadoId: invitado.id,
        secuencia: evento.ics_sequence,
        inicio: ctx.evento.inicio,
        fin: ctx.evento.fin,
        resumen: evento.nombre,
        lugar: [evento.lugar, evento.direccion].filter(Boolean).join(", ") || null,
        url: enlaces.respuesta,
        organizador: { email: remitente, nombre: evento.remitente_nombre },
        asistente: { email: destinoReal, nombre: invitado.nombre },
      })
    : null;
  const mime = construirMime({
    de: { email: remitente, nombre: evento.remitente_nombre },
    para: { email: destinoReal, nombre: invitado.nombre },
    responderA: evento.reply_to,
    asunto: correo.asunto,
    html: correo.html,
    texto: correo.texto,
    urlBaja: enlaces.baja.startsWith("https://") ? enlaces.baja : null,
    ics,
  });
  return { mime, asunto: correo.asunto, bytes: correo.bytes };
}

const COLS_EVENTO = "id, nombre, inicio, fin, lugar, direccion, mapa_url, remitente, remitente_nombre, reply_to, ics_uid, ics_sequence";
const COLS_PLANTILLA = "id, asunto, preheader, modo, bloques, html, adjuntar_ics, version";

async function cargarMarca(db: CrmClient): Promise<{ marca: Partial<Marca>; modoPrueba: boolean }> {
  const { data, error } = await db.from("eventos_ajustes").select("marca, modo_prueba").eq("id", 1).single();
  if (error || !data) throw new Error(`No se pudieron leer los ajustes de eventos: ${error?.message ?? "sin datos"}`);
  return { marca: (data.marca ?? {}) as Partial<Marca>, modoPrueba: data.modo_prueba as boolean };
}

/** Un paso de la consola: reserva, genera, envía y registra un único correo. */
export async function enviarSiguiente(db: CrmClient, envioId: string, sesion: string): Promise<PasoEnvio> {
  const { data: reserva, error } = await db.rpc("envio_reservar_siguiente", { p_envio: envioId, p_sesion: sesion });
  if (error) throw new Error(error.message);
  const r = reserva as { status: string; invitado_id?: string; espera_ms?: number; motivo?: string | null; tope?: number };
  if (r.status === "espera") return { status: "espera", esperaMs: r.espera_ms ?? 1000 };
  if (r.status !== "ok") {
    return { status: r.status as "candado" | "no_activo" | "tope" | "incierto" | "completado", detalle: r.motivo ?? (r.tope ? `Tope ${r.tope}` : null) };
  }
  const invitadoId = r.invitado_id!;

  const cerrar = async (resultado: "enviado" | "error" | "incierto", version: number | null, err: string | null, pausar: string | null) => {
    const { error: e2 } = await db.rpc("envio_resultado", {
      p_envio: envioId,
      p_invitado: invitadoId,
      p_sesion: sesion,
      p_resultado: resultado,
      p_version: version,
      p_error: err,
      p_pausar: pausar,
    });
    if (e2) throw new Error(`No se pudo registrar el resultado: ${e2.message}`);
  };

  let email = "";
  let version: number | null = null;
  let remitente = "";
  let mime: string;
  try {
    const { data: envio } = await db.from("envios").select("evento_id, plantilla_id").eq("id", envioId).single();
    if (!envio) throw new Error("Envío no encontrado");
    const [{ data: evento }, { data: plantilla }, { data: invitado }, ajustes] = await Promise.all([
      db.from("eventos").select(COLS_EVENTO).eq("id", envio.evento_id).single(),
      db.from("plantillas").select(COLS_PLANTILLA).eq("id", envio.plantilla_id).single(),
      db.from("evento_invitados").select("id, email, nombre, empresa, cargo").eq("id", invitadoId).single(),
      cargarMarca(db),
    ]);
    if (!evento || !plantilla || !invitado) throw new Error("Faltan datos del evento, la plantilla o el invitado");
    email = invitado.email as string;
    version = plantilla.version as number;
    comprobarDestino(email, ajustes.modoPrueba);
    remitente = (evento.remitente as string | null) || remitentePorDefecto();
    mime = montarCorreo(evento as FilaEvento, plantilla as unknown as FilaPlantilla, invitado as FilaInvitado, ajustes.marca).mime;
  } catch (err) {
    // Nada ha salido todavía: error de preparación → se registra y se pausa.
    const msg = err instanceof Error ? err.message : String(err);
    await cerrar("error", version, msg, `No se pudo preparar el correo: ${msg}`);
    return { status: "ok", invitadoId, email, resultado: "error", error: msg, pausado: msg, ms: 0 };
  }

  // Errores seguidos de este envío (para la pausa de seguridad).
  const { data: ultimos } = await db
    .from("envio_destinatarios")
    .select("estado")
    .eq("envio_id", envioId)
    .in("estado", ["enviado", "error"])
    .order("reservado_en", { ascending: false })
    .limit(3);
  let seguidos = 0;
  for (const u of ultimos ?? []) {
    if (u.estado !== "error") break;
    seguidos++;
  }

  const res = await sendGraphMime(remitente, mime);
  const d = decidir(res, seguidos);
  await cerrar(d.resultado, version, d.error, d.pausar);
  return { status: "ok", invitadoId, email, resultado: d.resultado, error: d.error, pausado: d.pausar, ms: res.ms };
}

/**
 * Envío de prueba de una plantilla con los datos de un invitado real (o de
 * ejemplo), SIEMPRE a una dirección @yopmail.com, sin tocar ningún estado.
 */
export async function enviarPrueba(
  db: CrmClient,
  args: { plantillaId: string; destino: string; invitadoId?: string | null },
): Promise<{ ok: boolean; detalle: string }> {
  const destino = args.destino.trim().toLowerCase();
  if (!esDireccionDePrueba(destino)) return { ok: false, detalle: "Los envíos de prueba solo pueden ir a direcciones @yopmail.com." };

  const { data: plantilla } = await db.from("plantillas").select(`${COLS_PLANTILLA}, evento_id`).eq("id", args.plantillaId).single();
  if (!plantilla?.evento_id) return { ok: false, detalle: "La plantilla no está asociada a un evento." };
  const { data: evento } = await db.from("eventos").select(COLS_EVENTO).eq("id", plantilla.evento_id).single();
  if (!evento) return { ok: false, detalle: "Evento no encontrado." };

  let invitado: FilaInvitado = { id: "00000000-0000-0000-0000-000000000000", email: destino, nombre: "Nombre Apellido", empresa: "Empresa de ejemplo", cargo: null };
  if (args.invitadoId) {
    const { data } = await db.from("evento_invitados").select("id, email, nombre, empresa, cargo").eq("id", args.invitadoId).single();
    if (data) invitado = data as FilaInvitado;
  }
  const { marca } = await cargarMarca(db);
  const { mime, asunto } = montarCorreo(evento as FilaEvento, plantilla as unknown as FilaPlantilla, invitado, marca, destino);
  const res = await sendGraphMime((evento as FilaEvento).remitente || remitentePorDefecto(), mime);
  await db.rpc("auditar", {
    p_evento: plantilla.evento_id,
    p_envio: null,
    p_accion: "envio_prueba",
    p_detalle: { plantilla: args.plantillaId, version: plantilla.version, destino, ok: res.ok, status: res.status },
  });
  return res.ok ? { ok: true, detalle: `Enviado «${asunto}» a ${destino}.` } : { ok: false, detalle: `Microsoft respondió HTTP ${res.status}: ${res.detalle}` };
}
