import type { ReactNode } from "react";

export type BadgeTone = "navy" | "gold" | "muted" | "green" | "red" | "outline";

const TONES: Record<BadgeTone, string> = {
  navy: "bg-icam-900/10 text-icam-900",
  gold: "bg-icam-gold/15 text-[#7d6235]",
  muted: "bg-subtle text-text-muted",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  outline: "border border-dashed border-icam-gold/60 text-[#7d6235]",
};

export function Badge({ tone = "navy", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const ESTADO_RELACION: Record<string, { label: string; tone: BadgeTone }> = {
  nueva: { label: "Nueva", tone: "gold" },
  clasificada: { label: "Clasificada", tone: "navy" },
  archivada: { label: "Archivada", tone: "muted" },
};
