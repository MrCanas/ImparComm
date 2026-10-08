/**
 * Clases compartidas. icam no tiene componentes Button/Input: usa Tailwind en
 * línea con estas mismas recetas. Aquí se centralizan para no repetirlas.
 * Alturas mínimas de 44px (min-h-11) para que todo sea pulsable con el dedo.
 */

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-icam-900/30 disabled:cursor-not-allowed disabled:opacity-60";

export const btn = {
  primary: `${btnBase} bg-icam-900 text-white hover:bg-icam-800`,
  gold: `${btnBase} bg-icam-gold text-white hover:bg-icam-gold-hover`,
  secondary: `${btnBase} border border-subtle bg-card text-text-primary hover:bg-page`,
  ghost: `${btnBase} text-text-primary hover:bg-subtle/50`,
  danger: `${btnBase} border border-red-200 bg-card text-red-700 hover:bg-red-50`,
} as const;

export const input =
  "w-full min-h-11 rounded-md border border-subtle bg-card px-3 text-sm text-text-body placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-icam-900/20";

export const label = "mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted";

export const card = "rounded-lg border border-subtle/50 bg-card shadow-sm";
