/**
 * Lógica pura de las integraciones (sin red ni base de datos), para poder
 * probarla con `npm test`.
 */

const TZ = "Europe/Madrid";

/** Hora (0-23) en Madrid de un instante. Los crons de Vercel van en UTC. */
export function horaMadrid(fecha: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(fecha),
  );
}

/** Día de la semana en Madrid (0 = domingo … 5 = viernes). */
export function diaSemanaMadrid(fecha: Date): number {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(fecha);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d);
}

/** Fecha (YYYY-MM-DD) en Madrid: identifica la semana del envío. */
export function fechaMadrid(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(fecha);
}

/**
 * ¿Toca enviar el resumen? Viernes a las 9:00 hora de Madrid. Vercel lanza el
 * cron a las 7:00 y a las 8:00 UTC; según sea horario de verano o de invierno,
 * solo una de las dos cae a las 9:00 en Madrid.
 */
export function esMomentoDelResumen(ahora: Date): boolean {
  return diaSemanaMadrid(ahora) === 5 && horaMadrid(ahora) === 9;
}

export interface Asistente {
  email: string;
  nombre: string;
}

interface GraphEmail {
  emailAddress?: { address?: string | null; name?: string | null } | null;
}

/** Asistentes externos de un evento (incluido el organizador), sin duplicados. */
export function externosDeEvento(
  evento: { attendees?: GraphEmail[] | null; organizer?: GraphEmail | null },
  dominiosInternos: string[],
): Asistente[] {
  const internos = new Set(dominiosInternos.map((d) => d.toLowerCase()));
  const vistos = new Map<string, Asistente>();
  for (const a of [...(evento.attendees ?? []), ...(evento.organizer ? [evento.organizer] : [])]) {
    const email = a.emailAddress?.address?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const dominio = email.split("@")[1]!;
    if (internos.has(dominio)) continue;
    if (!vistos.has(email)) vistos.set(email, { email, nombre: a.emailAddress?.name?.trim() || email });
  }
  return [...vistos.values()];
}

/** Texto plano a partir del HTML de un email (suficiente para leer la firma). */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const TELEFONO = /(?:\+|00)?\d[\d\s().-]{7,}\d/;
const PALABRAS_CARGO =
  /\b(ceo|cfo|coo|cto|cio|director|directora|socio|socia|partner|managing|manager|gerente|responsable|head|analista|analyst|associate|asociado|asociada|vp|vice ?president|presidente|presidenta|consejero|consejera|fundador|fundadora|founder|abogado|abogada|banquero|banca|gestor|gestora|broker|asesor|asesora|jefe|jefa|officer)\b/i;

/**
 * Extrae cargo y teléfono de la firma de un email (texto plano).
 * Busca el nombre de la persona y mira las líneas siguientes; si no aparece,
 * mira las últimas líneas. Solo devuelve esos dos campos: nunca el texto.
 */
export function parsearFirma(texto: string, nombre: string): { cargo?: string; telefono?: string } {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lineas.length === 0) return {};

  const nombreNorm = normalizar(nombre);
  const primerNombre = nombreNorm.split(" ")[0] ?? "";
  let inicio = lineas.findIndex((l) => {
    const n = normalizar(l);
    return n === nombreNorm || (primerNombre.length > 2 && n.startsWith(primerNombre) && n.length <= nombreNorm.length + 20);
  });
  if (inicio === -1) inicio = Math.max(0, lineas.length - 8);
  const bloque = lineas.slice(inicio, inicio + 8);

  const resultado: { cargo?: string; telefono?: string } = {};
  for (const l of bloque) {
    if (!resultado.telefono) {
      const m = l.match(TELEFONO);
      const digitos = m?.[0].replace(/\D/g, "") ?? "";
      if (m && digitos.length >= 9 && digitos.length <= 15) resultado.telefono = m[0].trim();
    }
    if (!resultado.cargo && l.length <= 80 && PALABRAS_CARGO.test(l) && !/@|https?:|www\./i.test(l)) {
      resultado.cargo = l.replace(/^[|·\-–\s]+|[|·\-–\s]+$/g, "");
    }
  }
  return resultado;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
