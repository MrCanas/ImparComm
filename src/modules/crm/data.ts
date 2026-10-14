import type { CrmClient } from "@/lib/db/server";
import type { TotalesJuego } from "@/modules/crm/gamificacion";
import type { Etiqueta, Hito, HitoPersona, Persona, Relacion } from "@/modules/crm/types";

/** Columnas de persona con empresa y etiquetas visibles (RLS filtra las personales ajenas). */
export const PERSONA_SELECT =
  "id, nombre, email, telefono, cargo, zoho_id, empresa:empresas(id, nombre), etiquetas_persona(etiqueta:etiquetas(id, nombre, tipo, plazo_dias))";

export const RELACION_SELECT = `id, estado, notas, ultima_reunion, proximo_recordatorio, origen, created_at, persona:personas!inner(${PERSONA_SELECT})`;

type Row = Record<string, unknown>;

function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

export function mapPersona(raw: Row): Persona {
  const etiquetas = ((raw.etiquetas_persona as Row[] | null) ?? [])
    .map((ep) => one<Etiqueta>(ep.etiqueta))
    .filter((e): e is Etiqueta => e !== null)
    .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === "general" ? -1 : 1));
  return {
    id: raw.id as string,
    nombre: raw.nombre as string,
    email: (raw.email as string | null) ?? null,
    telefono: (raw.telefono as string | null) ?? null,
    cargo: (raw.cargo as string | null) ?? null,
    zoho_id: (raw.zoho_id as string | null) ?? null,
    empresa: one<{ id: string; nombre: string }>(raw.empresa),
    etiquetas,
  };
}

export function mapRelacion(raw: Row): Relacion {
  return {
    id: raw.id as string,
    estado: raw.estado as Relacion["estado"],
    notas: (raw.notas as string | null) ?? null,
    ultima_reunion: (raw.ultima_reunion as string | null) ?? null,
    proximo_recordatorio: (raw.proximo_recordatorio as string | null) ?? null,
    origen: raw.origen as Relacion["origen"],
    created_at: raw.created_at as string,
    persona: mapPersona(one<Row>(raw.persona)!),
  };
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** Relaciones del empleado (Mis contactos). Es un filtro: el admin también ve aquí solo las suyas. */
export async function listMisRelaciones(db: CrmClient, userId: string): Promise<Relacion[]> {
  const rows = check(
    await db
      .from("relaciones")
      .select(RELACION_SELECT)
      .eq("empleado_id", userId)
      .order("created_at", { ascending: false }),
    "relaciones",
  ) as Row[];
  return rows.map(mapRelacion).sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre));
}

export async function getMiRelacion(
  db: CrmClient,
  userId: string,
  personaId: string,
): Promise<Relacion | null> {
  const row = check(
    await db
      .from("relaciones")
      .select(RELACION_SELECT)
      .eq("empleado_id", userId)
      .eq("persona_id", personaId)
      .maybeSingle(),
    "relación",
  ) as Row | null;
  return row ? mapRelacion(row) : null;
}

export async function listEtiquetas(db: CrmClient): Promise<Etiqueta[]> {
  const rows = check(
    await db.from("etiquetas").select("id, nombre, tipo, plazo_dias").order("nombre"),
    "etiquetas",
  ) as Etiqueta[];
  return rows;
}

export async function getPuntos(db: CrmClient, userId: string) {
  const [puntos, bonos, config] = await Promise.all([
    db.from("puntos").select("delta").eq("empleado_id", userId),
    db.from("bonos").select("id, fecha, importe, estado").eq("empleado_id", userId).order("fecha", { ascending: false }),
    db.from("config").select("clave, valor").in("clave", ["puntos_por_bono", "importe_bono"]),
  ]);
  const total = (check(puntos, "puntos") as { delta: number }[]).reduce((s, p) => s + p.delta, 0);
  const cfg = new Map((check(config, "config") as { clave: string; valor: unknown }[]).map((c) => [c.clave, Number(c.valor)]));
  const porBono = cfg.get("puntos_por_bono") || 50;
  return {
    total,
    porBono,
    importeBono: cfg.get("importe_bono") || 100,
    haciaSiguiente: ((total % porBono) + porBono) % porBono,
    bonos: check(bonos, "bonos") as { id: string; fecha: string; importe: number; estado: string }[],
  };
}

export async function listHitos(db: CrmClient): Promise<Hito[]> {
  return check(
    await db.from("hitos").select("*").order("fecha", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    "hitos",
  ) as Hito[];
}

export async function getHito(db: CrmClient, id: string): Promise<Hito | null> {
  return check(await db.from("hitos").select("*").eq("id", id).maybeSingle(), "hito") as Hito | null;
}

export async function listHitoPersonas(db: CrmClient, hitoId: string): Promise<HitoPersona[]> {
  const rows = check(
    await db
      .from("hito_persona")
      .select(`hito_id, persona_id, estado, canal, incluida_por, contactado_por, fecha_contacto, zoho_estado, zoho_error, persona:personas!inner(${PERSONA_SELECT})`)
      .eq("hito_id", hitoId),
    "hito_persona",
  ) as Row[];
  return rows
    .map((r) => ({
      hito_id: r.hito_id as string,
      persona_id: r.persona_id as string,
      estado: r.estado as HitoPersona["estado"],
      canal: (r.canal as string | null) ?? null,
      incluida_por: (r.incluida_por as string | null) ?? null,
      contactado_por: (r.contactado_por as string | null) ?? null,
      fecha_contacto: (r.fecha_contacto as string | null) ?? null,
      zoho_estado: (r.zoho_estado as HitoPersona["zoho_estado"]) ?? null,
      zoho_error: (r.zoho_error as string | null) ?? null,
      persona: mapPersona(one<Row>(r.persona)!),
    }))
    .sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre));
}

/** Hitos en los que está una persona (visibles para el empleado). */
export async function listHitosDePersona(db: CrmClient, personaId: string) {
  const rows = check(
    await db
      .from("hito_persona")
      .select("estado, fecha_contacto, hito:hitos!inner(id, nombre, ambito, fecha)")
      .eq("persona_id", personaId),
    "hitos de persona",
  ) as Row[];
  return rows.map((r) => ({
    estado: r.estado as HitoPersona["estado"],
    fecha_contacto: (r.fecha_contacto as string | null) ?? null,
    hito: one<{ id: string; nombre: string; ambito: string; fecha: string | null }>(r.hito)!,
  }));
}

export async function listReunionesDePersona(db: CrmClient, personaId: string) {
  const rows = check(
    await db
      .from("asistentes")
      .select("reunion:reuniones!inner(id, fecha, asunto, n_externos)")
      .eq("persona_id", personaId),
    "reuniones",
  ) as Row[];
  return rows
    .map((r) => one<{ id: string; fecha: string; asunto: string | null; n_externos: number }>(r.reunion)!)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** id → nombre de empleados (para «Contactado por X»). */
export async function nombresEmpleados(db: CrmClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.rpc("empleados_display", { p_ids: unique });
  if (error) throw new Error(`empleados_display: ${error.message}`);
  return new Map(((data ?? []) as { id: string; nombre: string }[]).map((e) => [e.id, e.nombre]));
}

export interface EventoGrande {
  reunionId: string;
  asunto: string | null;
  fecha: string;
  nExternos: number;
  relacionIds: string[];
}

/**
 * Reuniones con más externos que `evento_umbral_externos` (15 por defecto) que
 * tienen al menos dos contactos nuevos del empleado: en el ritual se agrupan en
 * una tarjeta «Evento». Cada persona va al evento grande más reciente.
 */
export async function eventosGrandes(db: CrmClient, nuevas: Relacion[]): Promise<EventoGrande[]> {
  if (nuevas.length === 0) return [];
  const { data: cfg } = await db.from("config").select("valor").eq("clave", "evento_umbral_externos").maybeSingle();
  const umbral = Number(cfg?.valor ?? 15) || 15;
  const porPersona = new Map(nuevas.map((r) => [r.persona.id, r.id]));

  const rows = check(
    await db
      .from("asistentes")
      .select("persona_id, reunion:reuniones!inner(id, asunto, fecha, n_externos)")
      .in("persona_id", [...porPersona.keys()])
      .gt("reunion.n_externos", umbral),
    "eventos",
  ) as Row[];

  const elegido = new Map<string, { id: string; asunto: string | null; fecha: string; n_externos: number }>();
  for (const r of rows) {
    const reunion = one<{ id: string; asunto: string | null; fecha: string; n_externos: number }>(r.reunion);
    if (!reunion) continue;
    const actual = elegido.get(r.persona_id as string);
    if (!actual || reunion.fecha > actual.fecha) elegido.set(r.persona_id as string, reunion);
  }

  const grupos = new Map<string, EventoGrande>();
  for (const [personaId, reunion] of elegido) {
    const g = grupos.get(reunion.id) ?? {
      reunionId: reunion.id,
      asunto: reunion.asunto,
      fecha: reunion.fecha,
      nExternos: reunion.n_externos,
      relacionIds: [],
    };
    g.relacionIds.push(porPersona.get(personaId)!);
    grupos.set(reunion.id, g);
  }
  return [...grupos.values()].filter((g) => g.relacionIds.length >= 2).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ─── Gamificación y analíticas (migración 006) ──────────────────────────────

export interface StatsEmpleado {
  serie: { dia: string; contactados: number; clasificados: number; incluidos: number }[];
  dias_activos: { dia: string; n: number }[];
  canales: { canal: string; n: number }[];
  hitos: { id: string; nombre: string; incluidos: number; contactados: number }[];
  totales: TotalesJuego;
}

export interface StatsEquipo {
  ranking: { id: string; nombre: string; contactados: number; clasificados: number; incluidos: number; xp: number }[];
  semanal: { semana: string; contactados: number; clasificados: number }[];
  hitos: { id: string; nombre: string; incluidos: number; contactados: number }[];
}

export interface StatsBolsa {
  adopciones: { semana: string; n: number }[];
  adoptados_mes: number;
  mis_rescates: number;
}

export function desdeDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
}

async function rpc<T>(db: CrmClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export function getStatsEmpleado(db: CrmClient, desde: string, empleadoId?: string) {
  return rpc<StatsEmpleado>(db, "stats_empleado", { p_desde: desde, ...(empleadoId ? { p_empleado: empleadoId } : {}) });
}

export function getStatsEquipo(db: CrmClient, desde: string) {
  return rpc<StatsEquipo>(db, "stats_equipo", { p_desde: desde });
}

export function getMiPosicion(db: CrmClient, desde: string) {
  return rpc<{ posicion: number; total: number; xp: number }>(db, "mi_posicion", { p_desde: desde });
}

export function getStatsBolsa(db: CrmClient) {
  return rpc<StatsBolsa>(db, "stats_bolsa");
}

/** hito_id → totales y primeros nombres de los invitados visibles. */
export async function getHitosResumen(db: CrmClient) {
  const rows = await rpc<{ hito_id: string; total: number; contactados: number; nombres: string[] | null }[]>(db, "hitos_resumen");
  return new Map(
    (rows ?? []).map((r) => [r.hito_id, { total: Number(r.total), contactados: Number(r.contactados), nombres: r.nombres ?? [] }]),
  );
}

export interface HitoEvento {
  id: number;
  hito_id: string;
  persona_id: string;
  empleado_id: string | null;
  accion: "incluir" | "contactar" | "volver_pte" | "quitar";
  canal: string | null;
  created_at: string;
}

export async function listEventosHito(db: CrmClient, hitoId: string): Promise<HitoEvento[]> {
  return check(
    await db.from("hito_eventos").select("*").eq("hito_id", hitoId).order("created_at"),
    "hito_eventos",
  ) as HitoEvento[];
}

export async function listEventosDePersona(db: CrmClient, personaId: string) {
  const rows = check(
    await db
      .from("hito_eventos")
      .select("id, accion, canal, created_at, empleado_id, hito:hitos!inner(id, nombre)")
      .eq("persona_id", personaId)
      .order("created_at", { ascending: false })
      .limit(30),
    "eventos de persona",
  ) as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    accion: r.accion as HitoEvento["accion"],
    canal: (r.canal as string | null) ?? null,
    created_at: r.created_at as string,
    empleado_id: (r.empleado_id as string | null) ?? null,
    hito: one<{ id: string; nombre: string }>(r.hito)!,
  }));
}
