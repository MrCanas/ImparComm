/**
 * Qué hacer con la respuesta de Microsoft a cada envío (función pura).
 *
 * - 202            → enviado.
 * - corte/timeout  → incierto + PAUSA (no sabemos si salió: lo decide una persona).
 * - 429 / 5xx      → error + PAUSA (Microsoft está frenando o falla; nunca se insiste solo).
 * - 401 / 403      → error + PAUSA (problema de permisos o configuración).
 * - otros 4xx      → error de ese destinatario; el envío sigue con el siguiente,
 *                    salvo que se acumulen (ver `erroresSeguidos`).
 */
import type { ResultadoGraph } from "@/lib/email/mailer";

export interface Decision {
  resultado: "enviado" | "error" | "incierto";
  pausar: string | null;
  error: string | null;
}

export const MAX_ERRORES_SEGUIDOS = 3;

export function decidir(r: ResultadoGraph, erroresSeguidos = 0): Decision {
  if (r.ok) return { resultado: "enviado", pausar: null, error: null };
  if (r.incierto) {
    return {
      resultado: "incierto",
      pausar: "Se cortó la conexión con Microsoft durante un envío: revisa el destinatario incierto antes de reanudar",
      error: r.detalle,
    };
  }
  const detalle = `HTTP ${r.status}${r.detalle ? `: ${r.detalle}` : ""}`;
  if (r.status === 429 || r.status >= 500) {
    const espera = r.reintentarTrasS ? ` (Microsoft pide esperar ${r.reintentarTrasS} s)` : "";
    return { resultado: "error", pausar: `Microsoft está limitando o fallando${espera}. Reanuda más tarde.`, error: detalle };
  }
  if (r.status === 401 || r.status === 403 || r.status === 0) {
    return { resultado: "error", pausar: "Error de permisos o configuración con Microsoft 365.", error: detalle };
  }
  if (erroresSeguidos + 1 >= MAX_ERRORES_SEGUIDOS) {
    return { resultado: "error", pausar: `${MAX_ERRORES_SEGUIDOS} errores seguidos: pausa de seguridad.`, error: detalle };
  }
  return { resultado: "error", pausar: null, error: detalle };
}
