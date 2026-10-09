const PALETA = ["#1E2A56", "#B89660", "#2B3668", "#7d6235", "#4A5A8C", "#A0824F", "#5B6B9A"];

function color(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return PALETA[Math.abs(h) % PALETA.length];
}

export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] ?? ""))).toUpperCase();
}

export function Avatar({ nombre, size = "h-8 w-8 text-[11px]", className = "" }: { nombre: string; size?: string; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-card ${size} ${className}`}
      style={{ background: color(nombre) }}
      title={nombre}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Pila de iniciales solapadas con «+N» para el resto. */
export function AvatarStack({ nombres, total, max = 5 }: { nombres: string[]; total?: number; max?: number }) {
  const visibles = nombres.slice(0, max);
  const resto = (total ?? nombres.length) - visibles.length;
  if (visibles.length === 0) return null;
  return (
    <span className="flex items-center" aria-label={`${total ?? nombres.length} contactos: ${nombres.join(", ")}`}>
      {visibles.map((n, i) => (
        <Avatar key={`${n}-${i}`} nombre={n} className={`${i > 0 ? "-ml-2" : ""} transition-transform group-hover:translate-x-[var(--s)]`} />
      ))}
      {resto > 0 ? (
        <span className="-ml-2 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-text-muted ring-2 ring-card">
          +{resto}
        </span>
      ) : null}
    </span>
  );
}
