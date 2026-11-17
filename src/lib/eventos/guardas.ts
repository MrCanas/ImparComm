/**
 * Guardas del envío. El modo prueba está ACTIVO salvo que se desactive en los
 * dos sitios: la variable EVENTOS_SOLO_PRUEBA (por defecto activa) y el ajuste
 * `modo_prueba` de la base (por defecto activo). Basta con uno para bloquear.
 */

export const DOMINIO_PRUEBA = "yopmail.com";

type Entorno = Record<string, string | undefined>;

/** true si la variable de entorno permite envíos reales (hay que poner EVENTOS_SOLO_PRUEBA=0). */
export function entornoPermiteReal(env: Entorno = process.env): boolean {
  return env.EVENTOS_SOLO_PRUEBA?.trim() === "0";
}

export function esDireccionDePrueba(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DOMINIO_PRUEBA}`);
}

/**
 * Lanza un error si el destino no está permitido. Se llama justo antes de cada
 * envío a Graph, sea cual sea el origen (consola, envío de prueba…).
 */
export function comprobarDestino(email: string, modoPruebaBase: boolean, env: Entorno = process.env): void {
  const prueba = modoPruebaBase || !entornoPermiteReal(env);
  if (prueba && !esDireccionDePrueba(email)) {
    throw new Error(`Modo prueba: solo se permiten direcciones @${DOMINIO_PRUEBA} (bloqueado ${email}).`);
  }
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Normaliza (trim + minúsculas) y valida un email; null si no es válido. */
export function normalizarEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  const [local] = e.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return e;
}

const GENERICAS = new Set([
  "info", "admin", "contacto", "contact", "hola", "hello", "office", "oficina", "recepcion", "reception",
  "noreply", "no-reply", "administracion", "comercial", "ventas", "sales", "rrhh", "hr", "support", "soporte",
]);

/** Dirección genérica de empresa (info@, admin@…): se avisa en el informe, no se descarta. */
export function esGenerica(email: string): boolean {
  return GENERICAS.has(email.split("@")[0] ?? "");
}
