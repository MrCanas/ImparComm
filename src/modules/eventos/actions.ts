"use server";

import { randomUUID } from "node:crypto";
import { resolveMx } from "node:dns/promises";

import { revalidatePath } from "next/cache";

import { resolveAuthUserIdByEmail } from "@/lib/auth/resolve-auth-user";
import { createServiceRoleClient } from "@/lib/db/admin";
import { getCrm, type CrmClient } from "@/lib/db/server";
import { enviarPrueba, enviarSiguiente, type PasoEnvio } from "@/lib/eventos/envio";
import { aplicarFiltro, type Filtro } from "@/lib/eventos/filtros";
import { entornoPermiteReal } from "@/lib/eventos/guardas";
import { parsearCsv, procesarFilas, type Campo, type FilaImportada } from "@/lib/eventos/importar";
import { generarCorreo } from "@/lib/eventos/render/render";
import type { ContenidoPlantilla, Marca, TipoPlantilla } from "@/lib/eventos/render/tipos";
import { revisarPlantilla, type Revision } from "@/lib/eventos/render/validar";
import { enlacesInvitado } from "@/lib/eventos/enlaces";
import { hashToken, tokenInvitado } from "@/lib/eventos/tokens";

import { getAjustes, getEnvio, getEvento, getPlantilla, invitadosFiltrables, listarInvitados, emailsDeBaja } from "./data";
import { plantillaBase } from "./plantillas-base";
import type { Envio } from "./types";

export type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fallo(err: unknown): { ok: false; error: string } {
  const m = err instanceof Error ? err.message : String(err);
  console.error("[eventos]", m);
  if (/permission denied|row-level security|42501|Solo administradores/i.test(m)) return { ok: false, error: "No tienes permiso para hacer esto" };
  if (/duplicate key|23505/i.test(m)) return { ok: false, error: "Ya existe un registro igual" };
  return { ok: false, error: m };
}

async function admin(): Promise<{ db: CrmClient; userId: string }> {
  const { db, user } = await getCrm();
  if (!user.isAdmin) throw new Error("Solo administradores");
  return { db, userId: user.id };
}

const txt = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const opt = (v: FormDataEntryValue | null) => txt(v) || null;

/** Fecha y hora local de Madrid («2026-12-17T19:30») → ISO UTC. */
function madridAIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Fecha y hora no válidas");
  const tentativa = new Date(`${local}:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "longOffset" })
      .formatToParts(tentativa)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return new Date(`${local}:00${offset === "" ? "Z" : offset}`).toISOString();
}

async function auditar(db: CrmClient, eventoId: string | null, envioId: string | null, accion: string, detalle: Record<string, unknown> = {}) {
  await db.rpc("auditar", { p_evento: eventoId, p_envio: envioId, p_accion: accion, p_detalle: detalle });
}

// ─── Eventos ────────────────────────────────────────────────────────────────

function datosEvento(f: FormData) {
  const nombre = txt(f.get("nombre"));
  if (!nombre) throw new Error("El nombre es obligatorio");
  const inicio = madridAIso(txt(f.get("inicio")));
  const fin = madridAIso(txt(f.get("fin")));
  if (new Date(fin) <= new Date(inicio)) throw new Error("La hora de fin debe ser posterior al inicio");
  const limite = txt(f.get("fecha_limite"));
  const aforo = txt(f.get("aforo"));
  const replyTo = opt(f.get("reply_to"));
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) throw new Error("El email de respuesta (Reply-To) no es válido");
  const mapa = opt(f.get("mapa_url"));
  if (mapa && !/^https:\/\//.test(mapa)) throw new Error("El enlace al mapa debe empezar por https://");
  return {
    nombre,
    inicio,
    fin,
    lugar: opt(f.get("lugar")),
    direccion: opt(f.get("direccion")),
    mapa_url: mapa,
    fecha_limite: limite ? madridAIso(limite) : null,
    aforo: aforo ? Math.max(1, Number.parseInt(aforo, 10)) : null,
    permite_acompanante: f.get("permite_acompanante") === "on",
    reply_to: replyTo,
    remitente_nombre: txt(f.get("remitente_nombre")) || "Impar Capital",
    landing: {
      titulo: txt(f.get("landing_titulo")) || undefined,
      intro: txt(f.get("landing_intro")) || undefined,
      imagen: txt(f.get("landing_imagen")) || undefined,
      gracias_si: txt(f.get("gracias_si")) || undefined,
      gracias_quizas: txt(f.get("gracias_quizas")) || undefined,
      gracias_no: txt(f.get("gracias_no")) || undefined,
    },
  };
}

function slug(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "evento"}-${randomUUID().slice(0, 6)}`;
}

export async function crearEvento(f: FormData): Promise<Resultado<{ id: string }>> {
  try {
    const { db, userId } = await admin();
    const datos = datosEvento(f);
    const { data, error } = await db.from("eventos").insert({ ...datos, slug: slug(datos.nombre), creado_por: userId }).select("id").single();
    if (error) throw new Error(error.message);
    await auditar(db, data.id, null, "evento_creado", { nombre: datos.nombre });
    revalidatePath("/eventos");
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    return fallo(err);
  }
}

export async function actualizarEvento(id: string, f: FormData): Promise<Resultado> {
  try {
    const { db } = await admin();
    const datos = datosEvento(f);
    const estado = txt(f.get("estado"));
    const { data, error } = await db
      .from("eventos")
      .update({ ...datos, ...(["borrador", "activo", "cerrado"].includes(estado) ? { estado } : {}) })
      .eq("id", id)
      .select("id, ics_sequence");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Evento no encontrado");
    await auditar(db, id, null, "evento_editado", { ics_sequence: data[0]!.ics_sequence });
    revalidatePath(`/eventos/${id}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

// ─── Importación ────────────────────────────────────────────────────────────

export interface ResumenImportacion {
  totalFilas: number;
  nuevos: number;
  yaEnEvento: number;
  duplicados: { linea: number; email: string; primeraLinea: number }[];
  invalidos: { linea: number; valor: string; motivo: string }[];
  sinMx: { email: string; dominio: string }[];
  deBaja: string[];
  genericos: string[];
  responsablesDesconocidos: string[];
  muestra: FilaImportada[];
}

async function dominiosSinMx(dominios: string[]): Promise<Set<string>> {
  const sin = new Set<string>();
  const cola = [...dominios];
  const trabajador = async () => {
    for (let d = cola.shift(); d; d = cola.shift()) {
      try {
        const mx = await Promise.race([
          resolveMx(d),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
        ]);
        if (!mx.length) sin.add(d);
      } catch (err) {
        // Solo «no existe» cuenta como sin MX; un timeout no descarta a nadie.
        if (err instanceof Error && /ENOTFOUND|ENODATA/.test((err as NodeJS.ErrnoException).code ?? err.message)) sin.add(d);
      }
    }
  };
  await Promise.all(Array.from({ length: 16 }, trabajador));
  return sin;
}

interface EntradaImportacion {
  csv: string;
  mapeo: Partial<Record<Campo, number>>;
  tieneCabecera: boolean;
  origen?: string;
  etiquetas?: string;
}

async function analizar(db: CrmClient, eventoId: string, e: EntradaImportacion) {
  if (e.csv.length > 3_000_000) throw new Error("El fichero es demasiado grande (máximo ~3 MB).");
  const informe = procesarFilas(parsearCsv(e.csv), e.mapeo, {
    tieneCabecera: e.tieneCabecera,
    origenPorDefecto: e.origen?.trim() || null,
    etiquetasExtra: (e.etiquetas ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean),
  });
  const [existentes, bajas] = await Promise.all([listarInvitados(db, eventoId), emailsDeBaja(db)]);
  const enEvento = new Set(existentes.map((i) => i.email));
  const sinMx = await dominiosSinMx([...new Set(informe.validas.map((v) => v.email.split("@")[1]!))]);
  return { informe, enEvento, bajas, sinMx };
}

export async function previsualizarImportacion(eventoId: string, e: EntradaImportacion): Promise<Resultado<ResumenImportacion>> {
  try {
    const { db } = await admin();
    const { informe, enEvento, bajas, sinMx } = await analizar(db, eventoId, e);
    const responsables = [...new Set(informe.validas.map((v) => v.responsableEmail).filter((x): x is string => Boolean(x)))];
    const desconocidos: string[] = [];
    for (const r of responsables) if (!(await resolveAuthUserIdByEmail(r))) desconocidos.push(r);
    return {
      ok: true,
      data: {
        totalFilas: informe.totalFilas,
        nuevos: informe.validas.filter((v) => !enEvento.has(v.email) && !sinMx.has(v.email.split("@")[1]!)).length,
        yaEnEvento: informe.validas.filter((v) => enEvento.has(v.email)).length,
        duplicados: informe.duplicadas,
        invalidos: informe.invalidas,
        sinMx: informe.validas.filter((v) => sinMx.has(v.email.split("@")[1]!)).map((v) => ({ email: v.email, dominio: v.email.split("@")[1]! })),
        deBaja: informe.validas.filter((v) => bajas.has(v.email)).map((v) => v.email),
        genericos: informe.genericas,
        responsablesDesconocidos: desconocidos,
        muestra: informe.validas.slice(0, 20),
      },
    };
  } catch (err) {
    return fallo(err);
  }
}

/** Guarda la importación. Se vuelve a analizar en el servidor (no se confía en lo que manda el navegador). */
export async function confirmarImportacion(eventoId: string, e: EntradaImportacion): Promise<Resultado<{ insertados: number }>> {
  try {
    const { db } = await admin();
    const { informe, enEvento, sinMx } = await analizar(db, eventoId, e);
    const filas = informe.validas.filter((v) => !enEvento.has(v.email) && !sinMx.has(v.email.split("@")[1]!));

    const responsables = new Map<string, string | null>();
    for (const r of new Set(filas.map((f) => f.responsableEmail).filter((x): x is string => Boolean(x)))) {
      responsables.set(r, await resolveAuthUserIdByEmail(r));
    }
    // Vincular con personas de ImparComm por email (lectura con service role: el admin ve todo igualmente)
    const personas = new Map<string, string>();
    const svc = createServiceRoleClient().schema("crm");
    for (let i = 0; i < filas.length; i += 300) {
      const { data } = await svc.from("personas").select("id, email").in("email", filas.slice(i, i + 300).map((f) => f.email));
      for (const p of data ?? []) personas.set(p.email as string, p.id as string);
    }

    const registros = filas.map((f) => {
      const id = randomUUID();
      return {
        id,
        evento_id: eventoId,
        persona_id: personas.get(f.email) ?? null,
        email: f.email,
        nombre: f.nombre,
        empresa: f.empresa,
        cargo: f.cargo,
        telefono: f.telefono,
        responsable_id: f.responsableEmail ? (responsables.get(f.responsableEmail) ?? null) : null,
        etiquetas: f.etiquetas,
        origen: f.origen,
        token_hash: hashToken(tokenInvitado(id)),
      };
    });
    let insertados = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const { data, error } = await db.from("evento_invitados").upsert(registros.slice(i, i + 500), { onConflict: "evento_id,email", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      insertados += data?.length ?? 0;
    }
    await auditar(db, eventoId, null, "invitados_importados", { filas: informe.totalFilas, insertados, origen: e.origen ?? null });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true, data: { insertados } };
  } catch (err) {
    return fallo(err);
  }
}

export async function anadirInvitado(eventoId: string, f: FormData): Promise<Resultado> {
  try {
    const { db } = await admin();
    const email = txt(f.get("email")).toLowerCase();
    const { normalizarEmail } = await import("@/lib/eventos/guardas");
    if (!normalizarEmail(email)) throw new Error("Email no válido");
    const id = randomUUID();
    const { error } = await db.from("evento_invitados").insert({
      id,
      evento_id: eventoId,
      email,
      nombre: opt(f.get("nombre")),
      empresa: opt(f.get("empresa")),
      telefono: opt(f.get("telefono")),
      etiquetas: txt(f.get("etiquetas")).split(/[,;]/).map((x) => x.trim()).filter(Boolean),
      origen: opt(f.get("origen")) ?? "manual",
      token_hash: hashToken(tokenInvitado(id)),
    });
    if (error) throw new Error(error.message);
    await auditar(db, eventoId, null, "invitado_anadido", { email });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

export async function excluirInvitado(eventoId: string, invitadoId: string, excluir: boolean, motivo: string): Promise<Resultado> {
  try {
    const { db } = await admin();
    const { data, error } = await db
      .from("evento_invitados")
      .update({ excluido: excluir, excluido_motivo: excluir ? motivo.trim() || "Excluido a mano" : null })
      .eq("id", invitadoId)
      .eq("evento_id", eventoId)
      .select("email");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Invitado no encontrado");
    await auditar(db, eventoId, null, excluir ? "invitado_excluido" : "invitado_incluido", { email: data[0]!.email, motivo });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

export async function respuestaManual(
  eventoId: string,
  invitadoId: string,
  datos: { respuesta: "si" | "no" | "quizas"; acompanante: boolean; acompanante_nombre: string; comentario: string },
): Promise<Resultado> {
  try {
    const { db, userId } = await admin();
    const acomp = datos.respuesta !== "no" && datos.acompanante;
    const { data, error } = await db
      .from("evento_invitados")
      .update({
        respuesta: datos.respuesta,
        acompanante: acomp,
        acompanante_nombre: acomp ? datos.acompanante_nombre.trim() || null : null,
        comentario: datos.comentario.trim() || null,
        respondido_en: new Date().toISOString(),
      })
      .eq("id", invitadoId)
      .eq("evento_id", eventoId)
      .select("email");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Invitado no encontrado");
    await db.from("evento_respuestas").insert({
      invitado_id: invitadoId,
      respuesta: datos.respuesta,
      acompanante: acomp,
      acompanante_nombre: acomp ? datos.acompanante_nombre.trim() || null : null,
      comentario: datos.comentario.trim() || null,
      origen: "manual",
      registrado_por: userId,
    });
    await auditar(db, eventoId, null, "respuesta_manual", { email: data[0]!.email, respuesta: datos.respuesta });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

// ─── Plantillas ─────────────────────────────────────────────────────────────

export async function crearPlantilla(eventoId: string, tipo: TipoPlantilla, nombre: string, modo: "bloques" | "html"): Promise<Resultado<{ id: string }>> {
  try {
    const { db } = await admin();
    const base = plantillaBase(tipo);
    const { data, error } = await db
      .from("plantillas")
      .insert({
        evento_id: eventoId,
        tipo,
        nombre: nombre.trim() || "Nueva plantilla",
        asunto: base.asunto,
        preheader: base.preheader,
        modo,
        bloques: base.bloques,
        html:
          modo === "html"
            ? '<!doctype html>\n<html lang="es"><body>\n<!-- Pega aquí el HTML del diseñador. Obligatorio: {{enlace_respuesta}} y {{enlace_baja}} -->\n<p><a href="{{enlace_respuesta}}">Responder</a></p>\n<p><a href="{{enlace_baja}}">Darse de baja</a></p>\n</body></html>'
            : null,
        adjuntar_ics: base.adjuntar_ics,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await auditar(db, eventoId, null, "plantilla_creada", { plantilla: data.id, tipo });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    return fallo(err);
  }
}

export interface ContenidoEditable extends ContenidoPlantilla {
  nombre: string;
  adjuntar_ics: boolean;
}

export async function guardarPlantilla(id: string, c: ContenidoEditable): Promise<Resultado<{ version: number; revision: Revision }>> {
  try {
    const { db } = await admin();
    const actual = await getPlantilla(db, id);
    if (!actual) throw new Error("Plantilla no encontrada");
    const revision = revisarPlantilla(c, actual.tipo);
    if (revision.errores.length) return { ok: true, data: { version: actual.version, revision } };
    const { data, error } = await db
      .from("plantillas")
      .update({
        nombre: c.nombre.trim() || actual.nombre,
        asunto: c.asunto,
        preheader: c.preheader || null,
        modo: c.modo,
        bloques: c.bloques,
        html: c.modo === "html" ? c.html : actual.html,
        adjuntar_ics: c.adjuntar_ics,
      })
      .eq("id", id)
      .select("version")
      .single();
    if (error) throw new Error(error.message);
    if (data.version !== actual.version) {
      await auditar(db, actual.evento_id, null, "plantilla_guardada", { plantilla: id, version: data.version });
    }
    revalidatePath(`/eventos/${actual.evento_id}`);
    return { ok: true, data: { version: data.version as number, revision } };
  } catch (err) {
    return fallo(err);
  }
}

export async function restaurarVersion(id: string, version: number): Promise<Resultado> {
  try {
    const { db } = await admin();
    const { data: v, error } = await db.from("plantilla_versiones").select("contenido").eq("plantilla_id", id).eq("version", version).single();
    if (error) throw new Error(error.message);
    const c = v.contenido as ContenidoEditable;
    const r = await guardarPlantilla(id, c);
    if (!r.ok) return r;
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

/** HTML de vista previa con un invitado real (o de ejemplo). */
export async function previsualizarPlantilla(
  eventoId: string,
  c: ContenidoEditable,
  tipo: TipoPlantilla,
  invitadoId: string | null,
): Promise<Resultado<{ asunto: string; html: string; texto: string; kb: number; revision: Revision }>> {
  try {
    const { db } = await admin();
    const [evento, ajustes] = await Promise.all([getEvento(db, eventoId), getAjustes(db)]);
    if (!evento) throw new Error("Evento no encontrado");
    let inv = { id: "00000000-0000-0000-0000-000000000000", email: "ejemplo@yopmail.com", nombre: "Nombre Apellido", empresa: "Empresa de ejemplo", cargo: null as string | null };
    if (invitadoId) {
      const { data } = await db.from("evento_invitados").select("id, email, nombre, empresa, cargo").eq("id", invitadoId).maybeSingle();
      if (data) inv = data as typeof inv;
    }
    const correo = generarCorreo(
      c,
      {
        invitado: inv,
        evento: { nombre: evento.nombre, inicio: new Date(evento.inicio), fin: new Date(evento.fin), lugar: evento.lugar, direccion: evento.direccion, mapaUrl: evento.mapa_url },
        enlaces: enlacesInvitado(inv.id),
      },
      ajustes.marca,
    );
    return { ok: true, data: { asunto: correo.asunto, html: correo.html, texto: correo.texto, kb: Math.round(correo.bytes / 102.4) / 10, revision: revisarPlantilla(c, tipo) } };
  } catch (err) {
    return fallo(err);
  }
}

export async function enviarPruebaPlantilla(plantillaId: string, destino: string, invitadoId: string | null): Promise<Resultado<{ detalle: string }>> {
  try {
    const { db } = await admin();
    const r = await enviarPrueba(db, { plantillaId, destino, invitadoId });
    return r.ok ? { ok: true, data: { detalle: r.detalle } } : { ok: false, error: r.detalle };
  } catch (err) {
    return fallo(err);
  }
}

/** Sube una imagen para las plantillas o la landing (bucket público eventos-assets). */
export async function subirImagen(eventoId: string, f: FormData): Promise<Resultado<{ url: string }>> {
  try {
    await admin();
    const archivo = f.get("archivo");
    if (!(archivo instanceof File)) throw new Error("No se ha recibido ningún archivo");
    const tipos: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
    const ext = tipos[archivo.type];
    if (!ext) throw new Error("Formato no admitido (JPG, PNG, GIF o WebP)");
    if (archivo.size > 4 * 1024 * 1024) throw new Error("La imagen pesa más de 4 MB: optimízala (para email, mejor < 300 KB)");
    const svc = createServiceRoleClient();
    const { data: buckets } = await svc.storage.listBuckets();
    if (!buckets?.some((b) => b.name === "eventos-assets")) {
      const { error } = await svc.storage.createBucket("eventos-assets", { public: true, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: Object.keys(tipos) });
      if (error) throw new Error(error.message);
    }
    const ruta = `${eventoId}/${randomUUID()}.${ext}`;
    const { error } = await svc.storage.from("eventos-assets").upload(ruta, archivo, { contentType: archivo.type, cacheControl: "31536000", upsert: false });
    if (error) throw new Error(error.message);
    const url = svc.storage.from("eventos-assets").getPublicUrl(ruta).data.publicUrl;
    return { ok: true, data: { url } };
  } catch (err) {
    return fallo(err);
  }
}

// ─── Marca y modo prueba ────────────────────────────────────────────────────

export async function guardarMarca(marca: Partial<Marca>): Promise<Resultado> {
  try {
    const { db, userId } = await admin();
    const num = (v: unknown, min: number, max: number) => (typeof v === "number" && v >= min && v <= max ? v : undefined);
    const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
    const limpia: Partial<Marca> = {
      tituloTamano: num(marca.tituloTamano, 14, 60),
      subtituloTamano: num(marca.subtituloTamano, 12, 40),
      cuerpoTamano: num(marca.cuerpoTamano, 11, 24),
      pieTamano: num(marca.pieTamano, 9, 16),
      interlineado: num(marca.interlineado, 1, 2.2),
      anchoMax: num(marca.anchoMax, 480, 720),
      tituloEspaciado: num(marca.tituloEspaciado, 0, 8),
      colorPrincipal: color(marca.colorPrincipal),
      colorAcento: color(marca.colorAcento),
      colorTexto: color(marca.colorTexto),
      colorFondo: color(marca.colorFondo),
      colorTarjeta: color(marca.colorTarjeta),
    };
    const { error } = await db
      .from("eventos_ajustes")
      .update({ marca: Object.fromEntries(Object.entries(limpia).filter(([, v]) => v !== undefined)), updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await auditar(db, null, null, "marca_guardada", {});
    revalidatePath("/eventos");
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

export async function cambiarModoPrueba(activar: boolean, confirmacion: string): Promise<Resultado> {
  try {
    const { db, userId } = await admin();
    if (!activar) {
      if (confirmacion.trim() !== "ENVÍO REAL") throw new Error("Escribe ENVÍO REAL para confirmar");
      if (!entornoPermiteReal()) throw new Error("El servidor sigue en modo prueba: falta EVENTOS_SOLO_PRUEBA=0 en Vercel");
    }
    const { error } = await db.from("eventos_ajustes").update({ modo_prueba: activar, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    await auditar(db, null, null, activar ? "modo_prueba_activado" : "modo_prueba_desactivado", {});
    revalidatePath("/eventos");
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

// ─── Envíos ─────────────────────────────────────────────────────────────────

export interface VistaSegmento {
  total: number;
  bloqueados: { email: string; motivo: string }[];
  muestra: { id: string; email: string; nombre: string | null; empresa: string | null; respuesta: string | null }[];
  yaTratados: number;
}

/** Calcula el segmento descontando a quien ya se trató en este envío (para reanudar sin pasarse del límite). */
async function segmento(db: CrmClient, eventoId: string, filtro: Filtro, envioId: string | null) {
  const invitados = await invitadosFiltrables(db, eventoId);
  let tratados = new Set<string>();
  if (envioId) {
    const { data } = await db.from("envio_destinatarios").select("invitado_id").eq("envio_id", envioId).neq("estado", "pendiente");
    tratados = new Set((data ?? []).map((d) => d.invitado_id as string));
  }
  const restantes = invitados.filter((i) => !tratados.has(i.id));
  // El límite cuenta para todo el envío: si ya se trataron 20 de 50, quedan 30.
  const limite = filtro.limite && filtro.limite > 0 ? Math.max(0, filtro.limite - tratados.size) : null;
  const r = aplicarFiltro(restantes, { ...filtro, limite: undefined });
  const seleccionados = limite === null ? r.seleccionados : r.seleccionados.slice(0, limite);
  return { ...r, seleccionados, tratados: tratados.size };
}

export async function previsualizarSegmento(eventoId: string, filtro: Filtro, envioId: string | null = null): Promise<Resultado<VistaSegmento>> {
  try {
    const { db } = await admin();
    const r = await segmento(db, eventoId, filtro, envioId);
    return {
      ok: true,
      data: {
        total: r.seleccionados.length,
        bloqueados: r.bloqueados.map((b) => ({ email: b.invitado.email, motivo: b.motivo })),
        muestra: r.seleccionados.slice(0, 500).map((i) => ({ id: i.id, email: i.email, nombre: i.nombre, empresa: i.empresa, respuesta: i.respuesta })),
        yaTratados: r.tratados,
      },
    };
  } catch (err) {
    return fallo(err);
  }
}

export async function crearEnvio(eventoId: string, datos: { nombre: string; plantillaId: string; filtro: Filtro; delayS: number }): Promise<Resultado<{ id: string }>> {
  try {
    const { db, userId } = await admin();
    const ajustes = await getAjustes(db);
    const { data, error } = await db
      .from("envios")
      .insert({
        evento_id: eventoId,
        nombre: datos.nombre.trim() || "Envío",
        plantilla_id: datos.plantillaId,
        filtro: datos.filtro,
        delay_ms: Math.max(ajustes.delay_min_ms, Math.round(datos.delayS * 1000)),
        creado_por: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await auditar(db, eventoId, data.id as string, "envio_creado", { nombre: datos.nombre });
    revalidatePath(`/eventos/${eventoId}`);
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    return fallo(err);
  }
}

/** Editar un envío en borrador o en pausa (plantilla, segmento, ritmo). Se aplica al reanudar. */
export async function editarEnvio(envioId: string, datos: { nombre: string; plantillaId: string; filtro: Filtro; delayS: number }): Promise<Resultado> {
  try {
    const { db } = await admin();
    const envio = await getEnvio(db, envioId);
    if (!envio) throw new Error("Envío no encontrado");
    if (envio.estado !== "borrador" && envio.estado !== "pausado") throw new Error("Pausa el envío antes de editarlo");
    const ajustes = await getAjustes(db);
    const { error } = await db
      .from("envios")
      .update({
        nombre: datos.nombre.trim() || envio.nombre,
        plantilla_id: datos.plantillaId,
        filtro: datos.filtro,
        delay_ms: Math.max(ajustes.delay_min_ms, Math.round(datos.delayS * 1000)),
      })
      .eq("id", envioId);
    if (error) throw new Error(error.message);
    await auditar(db, envio.evento_id, envioId, "envio_editado", { plantilla: datos.plantillaId, delay_s: datos.delayS });
    revalidatePath(`/eventos/${envio.evento_id}/envios/${envioId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

/**
 * Iniciar o reanudar: recalcula el segmento con el filtro VIGENTE, fija los
 * destinatarios y pone el envío en curso. Exige escribir la confirmación.
 */
export async function iniciarEnvio(envioId: string, confirmacion: string): Promise<Resultado<{ destinatarios: number }>> {
  try {
    const { db } = await admin();
    const envio = await getEnvio(db, envioId);
    if (!envio) throw new Error("Envío no encontrado");
    const plantilla = await getPlantilla(db, envio.plantilla_id);
    if (!plantilla) throw new Error("La plantilla del envío ya no existe");
    const rev = revisarPlantilla(plantilla, plantilla.tipo);
    if (rev.errores.length) throw new Error(`La plantilla tiene errores: ${rev.errores.join(" ")}`);

    const r = await segmento(db, envio.evento_id, envio.filtro, envioId);
    const ids = r.seleccionados.map((i) => i.id);
    const { data: fij, error: e1 } = await db.rpc("envio_fijar_destinatarios", { p_envio: envioId, p_invitados: ids });
    if (e1) throw new Error(e1.message);
    const { count } = await db.from("envio_destinatarios").select("invitado_id", { count: "exact", head: true }).eq("envio_id", envioId).eq("estado", "pendiente");
    const pendientes = count ?? 0;
    if (pendientes === 0) throw new Error("No hay destinatarios pendientes con este segmento");
    const esperado = `ENVIAR ${pendientes}`;
    if (confirmacion.trim().toUpperCase() !== esperado) {
      throw new Error(`Para confirmar escribe exactamente: ${esperado}`);
    }
    const { error: e2 } = await db.rpc("envio_cambiar_estado", { p_envio: envioId, p_estado: "en_curso", p_motivo: null });
    if (e2) throw new Error(e2.message);
    await auditar(db, envio.evento_id, envioId, envio.estado === "borrador" ? "envio_iniciado" : "envio_reanudado", {
      pendientes,
      plantilla_version: plantilla.version,
      cambios_segmento: fij,
    });
    revalidatePath(`/eventos/${envio.evento_id}/envios/${envioId}`);
    return { ok: true, data: { destinatarios: pendientes } };
  } catch (err) {
    return fallo(err);
  }
}

/** Cuántos quedarían pendientes al iniciar/reanudar (para pedir la confirmación exacta). */
export async function pendientesAlIniciar(envioId: string): Promise<Resultado<{ pendientes: number }>> {
  try {
    const { db } = await admin();
    const envio = await getEnvio(db, envioId);
    if (!envio) throw new Error("Envío no encontrado");
    const r = await segmento(db, envio.evento_id, envio.filtro, envioId);
    return { ok: true, data: { pendientes: r.seleccionados.length } };
  } catch (err) {
    return fallo(err);
  }
}

export async function cambiarEstadoEnvio(envioId: string, estado: "pausado" | "cancelado", motivo: string | null): Promise<Resultado> {
  try {
    const { db } = await admin();
    const { error } = await db.rpc("envio_cambiar_estado", { p_envio: envioId, p_estado: estado, p_motivo: motivo });
    if (error) throw new Error(error.message);
    const envio = await getEnvio(db, envioId);
    revalidatePath(`/eventos/${envio?.evento_id}/envios/${envioId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}

/** Un paso de la consola (un correo). No revalida la ruta: la consola pinta el progreso. */
export async function pasoEnvio(envioId: string, sesion: string): Promise<Resultado<PasoEnvio>> {
  try {
    const { db } = await admin();
    return { ok: true, data: await enviarSiguiente(db, envioId, sesion) };
  } catch (err) {
    return fallo(err);
  }
}

export async function estadoEnvio(envioId: string): Promise<Resultado<{ envio: Envio; conteo: Record<string, number> }>> {
  try {
    const { db } = await admin();
    const envio = await getEnvio(db, envioId);
    if (!envio) throw new Error("Envío no encontrado");
    const conteo: Record<string, number> = {};
    for (const estado of ["pendiente", "enviando", "enviado", "error", "incierto", "omitido"]) {
      const { count } = await db.from("envio_destinatarios").select("invitado_id", { count: "exact", head: true }).eq("envio_id", envioId).eq("estado", estado);
      conteo[estado] = count ?? 0;
    }
    return { ok: true, data: { envio, conteo } };
  } catch (err) {
    return fallo(err);
  }
}

export async function resolverDestinatario(envioId: string, invitadoId: string, accion: "marcar_enviado" | "reintentar" | "omitir"): Promise<Resultado> {
  try {
    const { db } = await admin();
    const { error } = await db.rpc("envio_resolver_destinatario", { p_envio: envioId, p_invitado: invitadoId, p_accion: accion });
    if (error) throw new Error(error.message);
    const envio = await getEnvio(db, envioId);
    revalidatePath(`/eventos/${envio?.evento_id}/envios/${envioId}`);
    return { ok: true };
  } catch (err) {
    return fallo(err);
  }
}
