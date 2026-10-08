const TZ = "Europe/Madrid";

export function fmtFecha(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

export function fmtFechaCorta(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: TZ });
}

/** Fecha de hoy en Madrid como YYYY-MM-DD. */
export function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function diasDesde(fecha: string): number {
  const ms = new Date(`${hoyMadrid()}T12:00:00`).getTime() - new Date(`${fecha.slice(0, 10)}T12:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Instante (ms) de hace `dias` días; 0 si no hay límite. */
export function haceDias(dias: number | null): number {
  return dias ? Date.now() - dias * 86_400_000 : 0;
}
