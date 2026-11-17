/**
 * Variables de las plantillas: {{nombre}}, {{nombre|texto si falta}}, {{evento.fecha}}…
 * Los valores se escapan para HTML; las variables desconocidas se dejan tal
 * cual para que se vean en la vista previa (y la validación las señala).
 */
import type { ContextoCorreo } from "./tipos";

export const VARIABLES = [
  "nombre",
  "nombre_completo",
  "empresa",
  "cargo",
  "email",
  "evento.nombre",
  "evento.fecha",
  "evento.hora",
  "evento.lugar",
  "evento.direccion",
  "enlace_respuesta",
  "enlace_baja",
  "enlace_calendario",
] as const;

const RE = /\{\{\s*([a-z_.]+)\s*(?:\|([^}]*))?\}\}/g;

export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fmtFecha = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export function fechaEvento(d: Date): string {
  return fmtFecha.format(d);
}
export function horaEvento(inicio: Date, fin: Date): string {
  return `${fmtHora.format(inicio)} – ${fmtHora.format(fin)}`;
}

/** Valor crudo (sin escapar) de una variable, o null si está vacía o no existe. */
export function valorVariable(nombre: string, ctx: ContextoCorreo): string | null {
  const nombrePila = ctx.invitado.nombre?.trim().split(/\s+/)[0] ?? "";
  const v: Record<string, string | null | undefined> = {
    nombre: nombrePila,
    nombre_completo: ctx.invitado.nombre,
    empresa: ctx.invitado.empresa,
    cargo: ctx.invitado.cargo,
    email: ctx.invitado.email,
    "evento.nombre": ctx.evento.nombre,
    "evento.fecha": fechaEvento(ctx.evento.inicio),
    "evento.hora": horaEvento(ctx.evento.inicio, ctx.evento.fin),
    "evento.lugar": ctx.evento.lugar,
    "evento.direccion": ctx.evento.direccion,
    enlace_respuesta: ctx.enlaces.respuesta,
    enlace_baja: ctx.enlaces.baja,
    enlace_calendario: ctx.enlaces.calendario,
  };
  const val = v[nombre];
  return val && val.trim() ? val.trim() : null;
}

/**
 * Sustituye variables. `escapar` = true para HTML: escapa los VALORES. El texto
 * por defecto (`{{nombre|…}}`) se inserta tal cual porque forma parte de la
 * plantilla, que ya está escapada (bloques) o es HTML del autor (modo HTML).
 */
export function sustituir(texto: string, ctx: ContextoCorreo, escapar: boolean): string {
  return texto.replace(RE, (todo, nombre: string, porDefecto: string | undefined) => {
    if (!(VARIABLES as readonly string[]).includes(nombre)) return todo;
    const val = valorVariable(nombre, ctx);
    if (val !== null) return escapar ? escHtml(val) : val;
    return porDefecto?.trim() ?? "";
  });
}

/** Variables usadas en un texto que no existen (para avisar al editar). */
export function variablesDesconocidas(texto: string): string[] {
  const out = new Set<string>();
  for (const m of texto.matchAll(RE)) {
    if (!(VARIABLES as readonly string[]).includes(m[1]!)) out.add(m[1]!);
  }
  return [...out];
}
