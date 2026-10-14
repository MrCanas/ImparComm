"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Anillo de progreso (0..1) que se rellena al montarse. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  color = "#B89660",
  track = "#EAEBEE",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  label?: string;
}) {
  const reducido = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reducido ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center">{children}</span>
    </div>
  );
}

/** Barra de progreso con brillo que recorre la parte rellena. */
export function ProgressBar({
  value,
  className = "h-3",
  tone = "gold",
  label,
}: {
  value: number;
  className?: string;
  tone?: "gold" | "navy" | "green";
  label?: string;
}) {
  const reducido = useReducedMotion();
  const v = Math.max(0, Math.min(1, value || 0));
  const fill = tone === "gold" ? "bg-gradient-to-r from-icam-gold to-[#D9C29A]" : tone === "navy" ? "bg-gradient-to-r from-icam-900 to-icam-800" : "bg-gradient-to-r from-emerald-500 to-emerald-400";
  return (
    <div
      className={`overflow-hidden rounded-full bg-subtle ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <motion.div
        className={`fx-shimmer h-full rounded-full ${fill}`}
        initial={{ width: reducido ? `${v * 100}%` : "0%" }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
