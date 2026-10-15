"use client";

import confetti from "canvas-confetti";

/** Navy y dorado de Impar. */
const COLORES = ["#1E2A56", "#B89660", "#D9C29A", "#2B3668", "#FFFFFF"];

/** Solo para momentos que lo merecen: no se lanza en cada acción. */
export type Celebracion = "hito" | "bono";

function reducido(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lanza confeti. `origen` en píxeles de viewport (p. ej. el centro del botón
 * pulsado); sin origen sale del centro de la pantalla.
 */
export function celebrar(tipo: Celebracion, origen?: { x: number; y: number }) {
  if (typeof window === "undefined" || reducido()) return;
  const o = origen
    ? { x: origen.x / window.innerWidth, y: origen.y / window.innerHeight }
    : { x: 0.5, y: 0.55 };
  const base = { colors: COLORES, origin: o, disableForReducedMotion: true, zIndex: 80 };

  // Un único disparo, corto y contenido.
  confetti({
    ...base,
    particleCount: tipo === "hito" ? 90 : 70,
    spread: 75,
    startVelocity: 32,
    scalar: 0.8,
    ticks: 140,
  });
}

/** Centro de un elemento, para usarlo como origen del confeti o del «+1». */
export function centroDe(el: Element | null | undefined): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
