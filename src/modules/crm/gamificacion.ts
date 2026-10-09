/**
 * Lógica pura de la capa de juego: niveles, rachas, logros y tramos de
 * antigüedad. Sin dependencias de React ni de la base de datos, para poder
 * probarla con node:test.
 *
 * La experiencia (XP) es la suma de los puntos del ritual (ledger crm.puntos,
 * el que genera bonos) y los contactos marcados en hitos. Los bonos no cambian.
 */

export interface Nivel {
  nombre: string;
  emoji: string;
  desde: number;
  color: string;
}

export const NIVELES: Nivel[] = [
  { nombre: "Bronce", emoji: "🥉", desde: 0, color: "#A86F3F" },
  { nombre: "Plata", emoji: "🥈", desde: 50, color: "#8C96A8" },
  { nombre: "Oro", emoji: "🥇", desde: 150, color: "#B89660" },
  { nombre: "Platino", emoji: "💎", desde: 350, color: "#5B8DB8" },
  { nombre: "Impar", emoji: "👑", desde: 700, color: "#1E2A56" },
];

export function nivelDe(xp: number) {
  const idx = NIVELES.reduce((acc, n, i) => (xp >= n.desde ? i : acc), 0);
  const actual = NIVELES[idx];
  const siguiente = NIVELES[idx + 1] ?? null;
  const progreso = siguiente ? (xp - actual.desde) / (siguiente.desde - actual.desde) : 1;
  return { actual, siguiente, progreso: Math.max(0, Math.min(1, progreso)), faltan: siguiente ? siguiente.desde - xp : 0 };
}

const DIA_MS = 86_400_000;

function diaUTC(iso: string): number {
  return Math.floor(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / DIA_MS);
}

/**
 * Racha de días seguidos con actividad. Si hoy aún no hay actividad, la racha
 * de ayer sigue viva (no se pierde hasta que acaba el día).
 */
export function rachaDe(diasActivos: string[], hoy: string): { actual: number; mejor: number } {
  const dias = [...new Set(diasActivos.map(diaUTC))].sort((a, b) => a - b);
  let mejor = 0;
  let corrida = 0;
  for (let i = 0; i < dias.length; i++) {
    corrida = i > 0 && dias[i] === dias[i - 1] + 1 ? corrida + 1 : 1;
    mejor = Math.max(mejor, corrida);
  }
  const set = new Set(dias);
  let d = diaUTC(hoy);
  if (!set.has(d)) d -= 1;
  let actual = 0;
  while (set.has(d)) {
    actual += 1;
    d -= 1;
  }
  return { actual, mejor };
}

export interface TotalesJuego {
  puntos: number;
  contactados: number;
  incluidos: number;
  max_contactos_dia: number;
  hitos_completados: number;
  adoptados: number;
  bonos: number;
}

export interface Logro {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  conseguido: boolean;
  /** 0..1 hacia conseguirlo. */
  progreso: number;
}

const DEF_LOGROS: { id: string; nombre: string; descripcion: string; emoji: string; valor: (t: TotalesJuego, racha: number) => number; meta: number }[] = [
  { id: "primer-contacto", nombre: "Rompehielos", descripcion: "Marca tu primer contacto en un hito", emoji: "🧊", valor: (t) => t.contactados, meta: 1 },
  { id: "diez-dia", nombre: "Día de fuego", descripcion: "10 contactos en un mismo día", emoji: "🔥", valor: (t) => t.max_contactos_dia, meta: 10 },
  { id: "cincuenta", nombre: "Conector", descripcion: "50 contactos marcados en hitos", emoji: "🔗", valor: (t) => t.contactados, meta: 50 },
  { id: "hito-completo", nombre: "Pleno", descripcion: "Completa un hito al 100 % (mín. 3 invitados)", emoji: "🏁", valor: (t) => t.hitos_completados, meta: 1 },
  { id: "anfitrion", nombre: "Anfitrión", descripcion: "Invita a 25 contactos a hitos", emoji: "🎟️", valor: (t) => t.incluidos, meta: 25 },
  { id: "ritual-100", nombre: "Maestro del ritual", descripcion: "100 puntos en el ritual", emoji: "🃏", valor: (t) => t.puntos, meta: 100 },
  { id: "rescatador", nombre: "Rescatador", descripcion: "Adopta 5 contactos de la bolsa común", emoji: "🛟", valor: (t) => t.adoptados, meta: 5 },
  { id: "bono", nombre: "Premiado", descripcion: "Consigue tu primer bono", emoji: "🎁", valor: (t) => t.bonos, meta: 1 },
  { id: "racha-7", nombre: "Constante", descripcion: "Racha de 7 días seguidos", emoji: "📆", valor: (_t, r) => r, meta: 7 },
];

export function logrosDe(t: TotalesJuego, mejorRacha: number): Logro[] {
  return DEF_LOGROS.map((d) => {
    const v = d.valor(t, mejorRacha);
    return {
      id: d.id,
      nombre: d.nombre,
      descripcion: d.descripcion,
      emoji: d.emoji,
      conseguido: v >= d.meta,
      progreso: Math.max(0, Math.min(1, v / d.meta)),
    };
  });
}

export function xpDe(t: Pick<TotalesJuego, "puntos" | "contactados">): number {
  return t.puntos + t.contactados;
}

export const TRAMOS_ANTIGUEDAD = ["< 3 meses", "3-6 meses", "6-12 meses", "> 12 meses", "Sin reunión"] as const;

/** Tramo de antigüedad de la última reunión (riesgo de que el contacto se enfríe). */
export function tramoAntiguedad(ultimaReunion: string | null, hoy: string): (typeof TRAMOS_ANTIGUEDAD)[number] {
  if (!ultimaReunion) return "Sin reunión";
  const dias = diaUTC(hoy) - diaUTC(ultimaReunion);
  if (dias < 91) return "< 3 meses";
  if (dias < 183) return "3-6 meses";
  if (dias < 366) return "6-12 meses";
  return "> 12 meses";
}
