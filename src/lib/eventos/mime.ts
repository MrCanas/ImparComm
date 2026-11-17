/**
 * Mensaje MIME para Graph `sendMail` (cuerpo en base64, Content-Type text/plain).
 *
 * Lo comprobado en el test de calidad (16/11/2026) con Exchange Online:
 * - Conserva `List-Unsubscribe` pero ELIMINA `List-Unsubscribe-Post` y las
 *   cabeceras `X-` propias: no se ponen (no aportan nada).
 * - Fuerza el nombre visible del buzón remitente (ignora el del From).
 * - Conserva la estructura multipart y la parte text/calendar (la reescribe a su
 *   formato manteniendo UID, horas y textos).
 */
import { randomUUID } from "node:crypto";

export interface MensajeMime {
  de: { email: string; nombre: string };
  para: { email: string; nombre?: string | null };
  responderA?: string | null;
  asunto: string;
  html: string;
  texto: string;
  /** Enlace https de baja; se publica también como List-Unsubscribe. */
  urlBaja?: string | null;
  /** Invitación de calendario (METHOD:REQUEST) para el correo de confirmación. */
  ics?: string | null;
}

/** base64 en líneas de 76 caracteres (RFC 2045). */
export function base64Lineas(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/.{76}(?=.)/g, "$&\r\n");
}

/** Codifica una cabecera con caracteres no ASCII (RFC 2047, palabras de ≤75 caracteres). */
export function cabecera(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const palabras: string[] = [];
  let actual = "";
  for (const ch of s) {
    const prueba = actual + ch;
    // 12 = longitud de "=?UTF-8?B??=": el resultado no supera 75 caracteres.
    if (Math.ceil(Buffer.byteLength(prueba, "utf8") / 3) * 4 + 12 > 75) {
      palabras.push(actual);
      actual = ch;
    } else {
      actual = prueba;
    }
  }
  if (actual) palabras.push(actual);
  return palabras.map((p) => `=?UTF-8?B?${Buffer.from(p, "utf8").toString("base64")}?=`).join("\r\n ");
}

function direccion(email: string, nombre?: string | null): string {
  if (/[\r\n<>]/.test(email)) throw new Error("Dirección de correo no válida");
  return nombre ? `${cabecera(nombre.replace(/[\r\n"]/g, ""))} <${email}>` : `<${email}>`;
}

export function construirMime(m: MensajeMime, frontera: () => string = () => randomUUID()): string {
  if (m.urlBaja && !/^https:\/\//.test(m.urlBaja)) throw new Error("La URL de baja debe ser https");
  const alt = `alt_${frontera()}`;
  const cab = [
    `From: ${direccion(m.de.email, m.de.nombre)}`,
    `To: ${direccion(m.para.email, m.para.nombre)}`,
    ...(m.responderA ? [`Reply-To: ${direccion(m.responderA)}`] : []),
    `Subject: ${cabecera(m.asunto.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
    ...(m.urlBaja ? [`List-Unsubscribe: <${m.urlBaja}>, <mailto:${m.de.email}?subject=baja>`] : []),
  ];
  const partesAlt = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lineas(m.texto),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lineas(m.html),
    ...(m.ics
      ? [
          `--${alt}`,
          "Content-Type: text/calendar; charset=UTF-8; method=REQUEST",
          "Content-Transfer-Encoding: base64",
          "",
          base64Lineas(m.ics),
        ]
      : []),
    `--${alt}--`,
  ];
  if (!m.ics) {
    return [...cab, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...partesAlt, ""].join("\r\n");
  }
  const mix = `mix_${frontera()}`;
  return [
    ...cab,
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    "",
    `--${mix}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    ...partesAlt,
    `--${mix}`,
    'Content-Type: application/ics; name="invitacion.ics"',
    'Content-Disposition: attachment; filename="invitacion.ics"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lineas(m.ics),
    `--${mix}--`,
    "",
  ].join("\r\n");
}
