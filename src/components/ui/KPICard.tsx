interface KPICardProps {
  title: string;
  value: string;
  subtitle: string;
  highlight?: boolean;
  /**
   * Convierte la tarjeta en un botón que abre el detalle de la cifra.
   *
   * Opcional a propósito: la mayoría de los KPI del portal no llevan a ninguna
   * parte y un `<button>` que no hace nada es peor que un `<article>`. Cuando sí
   * llevan —Inversores— importa que sea un botón de verdad y no un `div` con
   * `onClick`: las marcas SVG de Recharts no son alcanzables con teclado, así
   * que esta tarjeta acaba siendo el camino corto para quien no usa ratón.
   */
  onClick?: () => void;
  /** Qué se abre al pulsar. Va al `aria-label`, porque «12» no dice nada solo. */
  actionLabel?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  highlight = false,
  onClick,
  actionLabel,
}: KPICardProps) {
  const contenido = (
    <>
      <div className={`h-[3px] ${highlight ? "bg-icam-gold" : "bg-icam-900"}`} />
      <div className="p-3 sm:p-4 min-w-0">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{title}</p>
        <p className="mt-2 text-xl sm:text-2xl lg:text-3xl font-semibold text-text-primary break-words leading-tight hyphens-auto">
          {value}
        </p>
        <p className="mt-1 text-sm text-text-muted leading-snug">{subtitle}</p>
      </div>
    </>
  );

  const clases = "bg-card rounded-lg border border-subtle/50 shadow-sm overflow-hidden min-w-0";

  if (!onClick) return <article className={clases}>{contenido}</article>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel ?? `${title}: ${value}`}
      className={`${clases} w-full text-left transition hover:border-icam-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-icam-900`}
    >
      {contenido}
    </button>
  );
}
