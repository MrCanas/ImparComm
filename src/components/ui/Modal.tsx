"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalWidth = "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Bloquea el cierre (Escape / click en overlay) mientras hay una acción en curso. */
  busy?: boolean;
  width?: ModalWidth;
  /**
   * `true` monta el diálogo en un portal a `document.body` con z-index por
   * encima de la barra flotante de portfolio (z-[65]). Sin esto, un modal
   * `z-50` abierto desde una gráfica quedaría *debajo* de la barra.
   */
  elevated?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const WIDTH_CLASS: Record<ModalWidth, string> = {
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
};

/** Lo que el navegador considera enfocable dentro del diálogo. */
const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Esqueleto común de diálogo (overlay + caja). Nació como AdminModal y se
 * promovió a compartido para que el drill-down de las gráficas de portfolio no
 * duplicase el mismo overlay por tercera vez.
 *
 * Declara `aria-modal="true"`, así que tiene que comportarse como tal: mientras
 * está abierto atrapa el foco con Tab, lo lleva dentro al abrir, lo devuelve a
 * quien lo abrió al cerrar y congela el scroll del fondo. Sin eso, tabular saca
 * el foco a la página de detrás —que el lector de pantalla da por oculta— y al
 * cerrar el foco vuelve al principio del documento.
 */
export function Modal({
  open,
  title,
  subtitle,
  busy = false,
  width = "lg",
  elevated = false,
  onClose,
  children,
  footer,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const devolverFocoA = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const enfocables = useCallback((): HTMLElement[] => {
    const caja = cajaRef.current;
    if (!caja) return [];
    return Array.from(caja.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }, []);

  // Escape para cerrar y Tab que no se escapa de la caja.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = enfocables();
      if (items.length === 0) {
        // Sin nada enfocable dentro, el foco vive en la caja: no dejarlo salir.
        e.preventDefault();
        cajaRef.current?.focus();
        return;
      }
      const primero = items[0];
      const ultimo = items[items.length - 1];
      const activo = document.activeElement;

      if (e.shiftKey && (activo === primero || activo === cajaRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose, enfocables]);

  // Foco dentro al abrir, de vuelta a quien abrió al cerrar, y fondo congelado.
  useEffect(() => {
    if (!open) return;

    devolverFocoA.current = document.activeElement as HTMLElement | null;
    const items = enfocables();
    (items[0] ?? cajaRef.current)?.focus();

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowPrevio;
      // El disparador puede haber desaparecido con el propio cierre.
      if (devolverFocoA.current?.isConnected) devolverFocoA.current.focus();
    };
  }, [open, enfocables]);

  const titleId = useId();

  if (!open) return null;

  const dialog = (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/50 p-4 sm:p-6 ${
        elevated ? "z-[80]" : "z-50"
      }`}
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[min(92vh,900px)] w-full ${WIDTH_CLASS[width]} flex-col overflow-hidden rounded-xl border border-subtle/60 bg-card shadow-xl`}
      >
        <header className="shrink-0 border-b border-subtle/40 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-subtle/40 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );

  if (!elevated) return dialog;
  return mounted ? createPortal(dialog, document.body) : null;
}
