/**
 * Interruptores de las integraciones. Todas vienen APAGADAS: cada una lee datos
 * personales o escribe fuera de la app, así que se encienden a propósito (y,
 * para calendario y firmas, después de la EIPD y la política interna).
 *
 *   CALENDARIO_ENABLED=1   captura de reuniones (Graph, Calendars.Read)
 *   FIRMAS_ENABLED=1       cargo y teléfono desde la firma (Graph, Mail.Read)
 *   ZOHO_SYNC_ENABLED=1    alta en Zoho CRM + Campaign al marcar Contactado
 *   RESUMEN_SEMANAL_ENABLED=1  email de los viernes a las 9:00 (Madrid)
 */
function on(name: string): boolean {
  return process.env[name]?.trim() === "1";
}

export const flags = {
  get calendario() {
    return on("CALENDARIO_ENABLED");
  },
  get firmas() {
    return on("FIRMAS_ENABLED");
  },
  get zoho() {
    return on("ZOHO_SYNC_ENABLED");
  },
  get resumenSemanal() {
    return on("RESUMEN_SEMANAL_ENABLED");
  },
};

/** URL pública de la app (enlaces en emails, webhooks de Graph). */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
