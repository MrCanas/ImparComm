/** Lecturas del módulo de eventos (identidad del empleado: RLS de administrador). */
import type { CrmClient } from "@/lib/db/server";
import type { InvitadoFiltrable } from "@/lib/eventos/filtros";

import type { Ajustes, Destinatario, Envio, Evento, Invitado, Plantilla } from "./types";

const PAGINA = 1000;

/** Lee todas las filas paginando (la API corta en 1000). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return out;
  }
}

export const EVENTO_COLS =
  "id, nombre, slug, inicio, fin, lugar, direccion, mapa_url, fecha_limite, aforo, permite_acompanante, landing, remitente, remitente_nombre, reply_to, ics_uid, ics_sequence, estado, created_at";

export async function listarEventos(db: CrmClient): Promise<Evento[]> {
  const { data, error } = await db.from("eventos").select(EVENTO_COLS).order("inicio", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Evento[];
}

export async function getEvento(db: CrmClient, id: string): Promise<Evento | null> {
  const { data, error } = await db.from("eventos").select(EVENTO_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Evento | null) ?? null;
}

const INVITADO_COLS =
  "id, evento_id, persona_id, email, nombre, empresa, cargo, telefono, responsable_id, etiquetas, origen, respuesta, acompanante, acompanante_nombre, telefono_rsvp, comentario, respondido_en, primera_visita, ultima_visita, n_visitas, rebotado_en, rebote_motivo, excluido, excluido_motivo, created_at";

export async function listarInvitados(db: CrmClient, eventoId: string): Promise<Invitado[]> {
  return todas<Invitado>((a, b) =>
    db.from("evento_invitados").select(INVITADO_COLS).eq("evento_id", eventoId).order("created_at").order("email").range(a, b),
  );
}

export async function emailsDeBaja(db: CrmClient): Promise<Set<string>> {
  const filas = await todas<{ email: string }>((a, b) => db.from("bajas").select("email").order("email").range(a, b));
  return new Set(filas.map((f) => f.email));
}

/** Tipos de plantilla ya enviados (estado enviado) a cada invitado del evento. */
export async function tiposRecibidos(db: CrmClient, eventoId: string): Promise<Map<string, Set<string>>> {
  const envios = await todas<{ id: string; plantilla: { tipo: string } | { tipo: string }[] | null }>((a, b) =>
    db.from("envios").select("id, plantilla:plantillas(tipo)").eq("evento_id", eventoId).range(a, b),
  );
  const tipoDeEnvio = new Map(envios.map((e) => [e.id, (Array.isArray(e.plantilla) ? e.plantilla[0]?.tipo : e.plantilla?.tipo) ?? "libre"]));
  const out = new Map<string, Set<string>>();
  if (!envios.length) return out;
  const filas = await todas<{ envio_id: string; invitado_id: string }>((a, b) =>
    db.from("envio_destinatarios").select("envio_id, invitado_id").in("envio_id", [...tipoDeEnvio.keys()]).eq("estado", "enviado").range(a, b),
  );
  for (const f of filas) {
    const set = out.get(f.invitado_id) ?? new Set<string>();
    set.add(tipoDeEnvio.get(f.envio_id) ?? "libre");
    out.set(f.invitado_id, set);
  }
  return out;
}

/** Invitados en el formato de los filtros (con bajas y tipos recibidos). */
export async function invitadosFiltrables(db: CrmClient, eventoId: string): Promise<InvitadoFiltrable[]> {
  const [invitados, bajas, recibidos] = await Promise.all([listarInvitados(db, eventoId), emailsDeBaja(db), tiposRecibidos(db, eventoId)]);
  return invitados.map((i) => ({
    id: i.id,
    email: i.email,
    nombre: i.nombre,
    empresa: i.empresa,
    etiquetas: i.etiquetas,
    origen: i.origen,
    responsable_id: i.responsable_id,
    respuesta: i.respuesta,
    acompanante: i.acompanante,
    excluido: i.excluido,
    rebotado: i.rebotado_en !== null,
    de_baja: bajas.has(i.email),
    tipos_recibidos: [...(recibidos.get(i.id) ?? [])],
    created_at: i.created_at,
  }));
}

const PLANTILLA_COLS = "id, evento_id, tipo, nombre, asunto, preheader, modo, bloques, html, adjuntar_ics, version, updated_at";

export async function listarPlantillas(db: CrmClient, eventoId: string): Promise<Plantilla[]> {
  const { data, error } = await db.from("plantillas").select(PLANTILLA_COLS).eq("evento_id", eventoId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Plantilla[];
}

export async function getPlantilla(db: CrmClient, id: string): Promise<Plantilla | null> {
  const { data, error } = await db.from("plantillas").select(PLANTILLA_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Plantilla | null) ?? null;
}

export async function versionesPlantilla(db: CrmClient, id: string): Promise<{ version: number; created_at: string; contenido: Record<string, unknown> }[]> {
  const { data, error } = await db.from("plantilla_versiones").select("version, created_at, contenido").eq("plantilla_id", id).order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { version: number; created_at: string; contenido: Record<string, unknown> }[];
}

const ENVIO_COLS = "id, evento_id, nombre, plantilla_id, filtro, estado, delay_ms, motivo_pausa, ultimo_envio_en, iniciado_en, completado_en, created_at";

export async function listarEnvios(db: CrmClient, eventoId: string): Promise<Envio[]> {
  const { data, error } = await db.from("envios").select(ENVIO_COLS).eq("evento_id", eventoId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Envio[];
}

export async function getEnvio(db: CrmClient, id: string): Promise<Envio | null> {
  const { data, error } = await db.from("envios").select(ENVIO_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Envio | null) ?? null;
}

export async function destinatariosEnvio(db: CrmClient, envioId: string): Promise<Destinatario[]> {
  const filas = await todas<Destinatario & { invitado: { email: string; nombre: string | null } | { email: string; nombre: string | null }[] | null }>((a, b) =>
    db
      .from("envio_destinatarios")
      .select("invitado_id, orden, estado, intentos, plantilla_version, reservado_en, enviado_en, error, invitado:evento_invitados(email, nombre)")
      .eq("envio_id", envioId)
      .order("orden")
      .range(a, b),
  );
  return filas.map(({ invitado, ...d }) => {
    const inv = Array.isArray(invitado) ? invitado[0] : invitado;
    return { ...d, email: inv?.email, nombre: inv?.nombre ?? null };
  });
}

export async function getAjustes(db: CrmClient): Promise<Ajustes> {
  const { data, error } = await db.from("eventos_ajustes").select("marca, modo_prueba, delay_min_ms, tope_diario").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return data as Ajustes;
}

/** Correos enviados hoy (día de Madrid) en todos los envíos, para mostrar el tope. */
export async function enviadosHoy(db: CrmClient): Promise<number> {
  const ahora = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(ahora);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "longOffset" })
      .formatToParts(ahora)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+01:00";
  const inicio = new Date(`${hoy}T00:00:00${offset}`);
  const { count, error } = await db
    .from("envio_destinatarios")
    .select("invitado_id", { count: "exact", head: true })
    .eq("estado", "enviado")
    .gte("enviado_en", inicio.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function auditoria(db: CrmClient, eventoId: string, limite = 50) {
  const { data, error } = await db
    .from("evento_auditoria")
    .select("id, envio_id, actor, accion, detalle, created_at")
    .eq("evento_id", eventoId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: number; envio_id: string | null; actor: string | null; accion: string; detalle: Record<string, unknown>; created_at: string }[];
}
