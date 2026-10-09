"use client";

import confetti from "canvas-confetti";

/** Navy y dorado de Impar, más un par de acentos para que luzca. */
const COLORES = ["#1E2A56", "#B89660", "#D9C29A", "#2B3668", "#FFFFFF"];

export type Celebracion = "contacto" | "hito" | "bono" | "logro" | "nivel";

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

  switch (tipo) {
    case "contacto":
      confetti({ ...base, particleCount: 40, spread: 55, startVelocity: 28, scalar: 0.8, ticks: 120 });
      break;
    case "logro":
      confetti({ ...base, particleCount: 80, spread: 90, startVelocity: 35, shapes: ["star"], scalar: 1.1 });
      break;
    case "hito":
    case "bono":
    case "nivel": {
      // Dos cañones laterales durante ~1,2 s.
      const fin = Date.now() + 1200;
      const frame = () => {
        confetti({ ...base, particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
        if (Date.now() < fin) requestAnimationFrame(frame);
      };
      frame();
      confetti({ ...base, particleCount: 120, spread: 100, startVelocity: 45, origin: { x: 0.5, y: 0.5 } });
      break;
    }
  }
}

/** Centro de un elemento, para usarlo como origen del confeti o del «+1». */
export function centroDe(el: Element | null | undefined): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
