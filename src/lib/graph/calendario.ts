/**
 * Captura desde Microsoft Graph (pendiente de registrar la app en Entra).
 *
 * - Calendars.Read (permiso de aplicación, consentimiento del administrador):
 *   suscripción webhook por buzón, renovada antes de los 7 días, más un repaso
 *   nocturno. Cada evento con asistentes externos crea/actualiza crm.reuniones,
 *   crm.asistentes, crm.personas (por email) y crm.relaciones (origen
 *   'calendario', ultima_reunion = fecha del evento, que reinicia el recordatorio).
 * - Mail.Read: solo para extraer cargo y teléfono de la firma. Nunca se guarda
 *   el texto del email.
 * - Si una reunión se borra en Outlook, se borra su rastro (crm.reuniones en cascada).
 *
 * Los dominios internos de Impar (todas las sociedades) se configurarán en
 * INTERNAL_DOMAINS para distinguir asistentes externos.
 */
export const INTERNAL_DOMAINS: string[] = ["imparcapital.com"];

export function esExterno(email: string): boolean {
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  return dominio !== "" && !INTERNAL_DOMAINS.includes(dominio);
}
