/**
 * Esqueleto genérico de carga para páginas del dashboard. Renderiza dentro del
 * layout (la nav ya está pintada), así que solo cubre el área de contenido.
 * Antes 28 de 32 páginas no mostraban nada mientras el RSC resolvía.
 */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="h-7 w-64 rounded-md bg-subtle/60" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-20 rounded-lg border border-subtle/50 bg-card" />
        <div className="h-20 rounded-lg border border-subtle/50 bg-card" />
        <div className="h-20 rounded-lg border border-subtle/50 bg-card" />
        <div className="h-20 rounded-lg border border-subtle/50 bg-card" />
      </div>
      <div className="h-72 rounded-lg border border-subtle/50 bg-card" />
      <div className="h-48 rounded-lg border border-subtle/50 bg-card" />
    </div>
  );
}
