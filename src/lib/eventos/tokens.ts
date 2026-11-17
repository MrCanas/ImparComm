/**
 * Enlace personal de cada invitado.
 *
 * El token no se guarda en la base: se deriva con HMAC-SHA256(secreto, id del
 * invitado) cada vez que se genera un correo, y en la base solo vive su sha256
 * (`token_hash`) para buscar al invitado cuando abre el enlace. 256 bits,
 * imposible de adivinar; si algún día se filtra el secreto, se rota y todos los
 * enlaces cambian a la vez (habría que recalcular token_hash). SOLO servidor.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secreto(): string {
  const s = process.env.EVENTOS_TOKEN_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("Falta EVENTOS_TOKEN_SECRET (mínimo 32 caracteres) para los enlaces de eventos.");
  }
  return s;
}

/** Token del enlace personal (base64url, 43 caracteres). */
export function tokenInvitado(invitadoId: string, secret = secreto()): string {
  return createHmac("sha256", secret).update(`evento-invitado:${invitadoId}`).digest("base64url");
}

/** Hash con el que se guarda y se busca el token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Formato válido de token (para rechazar basura antes de ir a la base). */
export function tokenBienFormado(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Comprueba que un token corresponde a un invitado (comparación en tiempo constante). */
export function tokenCorresponde(invitadoId: string, token: string, secret = secreto()): boolean {
  const esperado = Buffer.from(tokenInvitado(invitadoId, secret));
  const recibido = Buffer.from(token);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
