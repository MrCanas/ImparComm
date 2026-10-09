/**
 * Limitador de intentos en memoria, pensado para el login.
 *
 * Ventana deslizante por clave (IP + email). Es suficiente para un portal de
 * <15 usuarios: convierte la fuerza bruta ilimitada en un goteo. No es un
 * limitador distribuido —el estado vive en el proceso y Vercel puede tener
 * varias instancias—, pero cada instancia frena igual y no hay dependencia
 * externa. Si algún día hace falta algo serio, se cambia por Upstash aquí.
 */

interface Intento {
  cuenta: number;
  /** Momento en que expira la ventana (ms epoch). */
  expiraEn: number;
}

const intentos = new Map<string, Intento>();

export interface RateLimitConfig {
  /** Intentos permitidos dentro de la ventana. */
  max: number;
  /** Duración de la ventana en milisegundos. */
  ventanaMs: number;
}

export interface RateLimitResult {
  /** true si el intento se permite; false si hay que bloquear. */
  permitido: boolean;
  /** Segundos hasta que se puede reintentar (solo si !permitido). */
  reintentarEnSeg: number;
}

/**
 * Registra un intento y dice si se permite. Llamar una vez por intento.
 * Purga perezosa: cada llamada limpia las entradas caducadas que encuentra.
 */
export function comprobarRateLimit(
  clave: string,
  { max, ventanaMs }: RateLimitConfig,
  ahora = Date.now(),
): RateLimitResult {
  const actual = intentos.get(clave);

  if (!actual || actual.expiraEn <= ahora) {
    intentos.set(clave, { cuenta: 1, expiraEn: ahora + ventanaMs });
    purgar(ahora);
    return { permitido: true, reintentarEnSeg: 0 };
  }

  if (actual.cuenta >= max) {
    return {
      permitido: false,
      reintentarEnSeg: Math.ceil((actual.expiraEn - ahora) / 1000),
    };
  }

  actual.cuenta += 1;
  return { permitido: true, reintentarEnSeg: 0 };
}

/** Borra el contador de una clave: se llama tras un login correcto. */
export function limpiarRateLimit(clave: string): void {
  intentos.delete(clave);
}

/** Evita que el Map crezca sin fin con IPs que no vuelven. */
function purgar(ahora: number): void {
  if (intentos.size < 500) return;
  for (const [k, v] of intentos) {
    if (v.expiraEn <= ahora) intentos.delete(k);
  }
}
