"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const ENTERO = (n: number) => Math.round(n).toLocaleString("es-ES");

/**
 * Número que cuenta hasta su valor al entrar en pantalla y que, si cambia,
 * anima del valor anterior al nuevo con un pequeño «pop».
 * `prefix`/`suffix` sirven desde Server Components, que no pueden pasar `format`.
 */
export function AnimatedNumber({
  value,
  format: formatProp = ENTERO,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const format = (n: number) => `${prefix}${formatProp(n)}${suffix}`;
  const ref = useRef<HTMLSpanElement>(null);
  const previo = useRef(0);
  const inView = useInView(ref, { once: true });
  const reducido = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    const desde = previo.current;
    previo.current = value;
    if (reducido || desde === value) {
      el.textContent = format(value);
      return;
    }
    if (desde !== 0) {
      el.classList.remove("animate-pop");
      void el.offsetWidth; // reinicia la animación CSS
      el.classList.add("animate-pop");
    }
    const ctrl = animate(desde, value, {
      duration: desde === 0 ? 1.1 : 0.5,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    return () => ctrl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format se recrea en cada render
  }, [value, inView, reducido]);

  return (
    <span ref={ref} className={`inline-block tabular-nums ${className ?? ""}`}>
      {format(reducido ? value : 0)}
    </span>
  );
}
