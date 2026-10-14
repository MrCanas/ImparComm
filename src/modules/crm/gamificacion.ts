import type { IconName } from "@/components/ui/Icon";

/**
 * Lógica pura de la capa de motivación: rachas, objetivos y tramos de
 * antigüedad. Sin dependencias de React ni de la base de datos, para poder
 * probarla con node:test. Puntos y bonos no cambian.
 */

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

export interface TotalesActividad {
  puntos: number;
  contactados: number;
  incluidos: number;
  max_contactos_dia: number;
  hitos_completados: number;
  adoptados: number;
  bonos: number;
}

export interface Objetivo {
  id: string;
  nombre: string;
  descripcion: string;
  icon: IconName;
  conseguido: boolean;
  /** 0..1 hacia conseguirlo. */
  progreso: number;
  valor: number;
  meta: number;
}

const DEF_OBJETIVOS: { id: string; nombre: string; descripcion: string; icon: IconName; valor: (t: TotalesActividad, racha: number) => number; meta: number }[] = [
  { id: "primer-contacto", nombre: "Primer contacto", descripcion: "Marca tu primer contacto en un hito", icon: "check", valor: (t) => t.contactados, meta: 1 },
  { id: "diez-dia", nombre: "10 en un día", descripcion: "10 contactos en un mismo día", icon: "fire", valor: (t) => t.max_contactos_dia, meta: 10 },
  { id: "cincuenta", nombre: "50 contactos", descripcion: "50 contactos marcados en hitos", icon: "users", valor: (t) => t.contactados, meta: 50 },
  { id: "hito-completo", nombre: "Hito completado", descripcion: "Contacta a todos tus invitados de un hito (mín. 3)", icon: "flag", valor: (t) => t.hitos_completados, meta: 1 },
  { id: "anfitrion", nombre: "25 invitados", descripcion: "Invita a 25 contactos a hitos", icon: "mail", valor: (t) => t.incluidos, meta: 25 },
  { id: "ritual-100", nombre: "100 clasificados", descripcion: "100 puntos en el ritual", icon: "cards", valor: (t) => t.puntos, meta: 100 },
  { id: "rescatador", nombre: "5 de la bolsa", descripcion: "Adopta 5 contactos de la bolsa común", icon: "inbox", valor: (t) => t.adoptados, meta: 5 },
  { id: "bono", nombre: "Primer bono", descripcion: "Consigue tu primer bono", icon: "star", valor: (t) => t.bonos, meta: 1 },
  { id: "racha-7", nombre: "Racha de 7 días", descripcion: "7 días seguidos con actividad", icon: "calendar", valor: (_t, r) => r, meta: 7 },
];

export function objetivosDe(t: TotalesActividad, mejorRacha: number): Objetivo[] {
  return DEF_OBJETIVOS.map((d) => {
    const v = d.valor(t, mejorRacha);
    return {
      id: d.id,
      nombre: d.nombre,
      descripcion: d.descripcion,
      icon: d.icon,
      conseguido: v >= d.meta,
      progreso: Math.max(0, Math.min(1, v / d.meta)),
      valor: Math.min(v, d.meta),
      meta: d.meta,
    };
  });
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
