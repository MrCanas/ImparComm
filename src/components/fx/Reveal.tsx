"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Aparición escalonada: envuelve cada elemento de una lista con su índice. */
export function Reveal({
  children,
  index = 0,
  as = "div",
  className,
}: {
  children: ReactNode;
  index?: number;
  as?: "div" | "li" | "section";
  className?: string;
}) {
  const reducido = useReducedMotion();
  const M = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  return (
    <M
      className={className}
      initial={reducido ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 12) * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
  );
}
