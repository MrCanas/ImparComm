"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { input } from "@/components/ui/styles";
import type { Relacion } from "@/modules/crm/types";
import { Avatar } from "@/modules/crm/ui/ContactList";

/** Alto fijo de fila: permite virtualizar sin medir (solo se pintan las visibles). */
const FILA = 56;
const MARGEN_FILAS = 10;
/** Tras un scroll del usuario, la columna no le persigue hasta pasado este tiempo. */
const PAUSA_SEGUIR_MS = 1500;

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Cola del ritual en una columna lateral: hechas atenuadas, la actual resaltada y
 * las pendientes clicables para traerlas al frente. Virtualizada con filas de alto
 * fijo colocadas con transform (GPU), scroll pasivo y actualización por frame.
 * Va memoizada: el arrastre de la tarjeta re-renderiza el ritual en cada movimiento
 * y la columna no debe enterarse.
 */
export const ColaLateral = memo(function ColaLateral({
  cola,
  indice,
  hechos,
  bloqueado,
  onSaltar,
}: {
  cola: Relacion[];
  indice: number;
  hechos: Map<string, "clasificar" | "archivar">;
  bloqueado: boolean;
  onSaltar: (relacionId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ultimoScrollUsuario = useRef(0);
  const scrollProgramado = useRef(false);
  const [rango, setRango] = useState({ desde: 0, hasta: 30 });
  const [filtro, setFiltro] = useState("");

  const filas = useMemo(() => {
    const todas = cola.map((r, i) => ({ r, i }));
    const t = norm(filtro.trim());
    if (!t) return todas;
    return todas.filter(({ r }) =>
      norm(`${r.persona.nombre} ${r.persona.empresa?.nombre ?? ""} ${r.persona.email ?? ""}`).includes(t),
    );
  }, [cola, filtro]);

  // Rango visible: se recalcula como mucho una vez por frame y solo cambia el estado
  // si cambian las filas a pintar.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const medir = () => {
      frame = 0;
      const desde = Math.max(0, Math.floor(el.scrollTop / FILA) - MARGEN_FILAS);
      const hasta = Math.ceil((el.scrollTop + el.clientHeight) / FILA) + MARGEN_FILAS;
      setRango((r) => (r.desde === desde && r.hasta === hasta ? r : { desde, hasta }));
    };
    const onScroll = () => {
      if (!scrollProgramado.current) ultimoScrollUsuario.current = Date.now();
      if (!frame) frame = requestAnimationFrame(medir);
    };
    const onWheel = () => {
      scrollProgramado.current = false;
      ultimoScrollUsuario.current = Date.now();
    };
    const ro = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(medir);
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onWheel, { passive: true });
    ro.observe(el);
    medir();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onWheel);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Pulsar un contacto es una orden explícita: se limpia la búsqueda y la columna lo sigue.
  function saltar(relacionId: string) {
    ultimoScrollUsuario.current = 0;
    setFiltro("");
    onSaltar(relacionId);
  }

  // Sigue a la tarjeta actual (centrada, con scroll suave) salvo que el usuario esté
  // buscando: con filtro o si acaba de hacer scroll él mismo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || filtro.trim() || Date.now() - ultimoScrollUsuario.current < PAUSA_SEGUIR_MS) return;
    const top = indice * FILA;
    if (top >= el.scrollTop + FILA && top + 2 * FILA <= el.scrollTop + el.clientHeight) return;
    scrollProgramado.current = true;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2 + FILA / 2), behavior: "smooth" });
    const t = window.setTimeout(() => (scrollProgramado.current = false), 600);
    return () => window.clearTimeout(t);
  }, [indice, filtro, cola]);

  const pendientes = Math.max(0, cola.length - indice);
  const visibles = filas.slice(rango.desde, rango.hasta);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-subtle bg-card">
      <div className="border-b border-subtle/60 p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Cola</h2>
          <span className="text-xs text-text-muted">
            {pendientes} pendiente{pendientes === 1 ? "" : "s"} · {hechos.size} hecha{hechos.size === 1 ? "" : "s"}
          </span>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFiltro("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Buscar contacto…"
          aria-label="Buscar contacto en la cola"
          className={`${input} min-h-9 text-sm`}
        />
      </div>

      <div
        ref={scrollRef}
        data-cola-scroll
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        style={{ contain: "strict" }}
      >
        {filas.length === 0 ? (
          <p className="p-4 text-center text-sm text-text-muted">Ningún contacto coincide.</p>
        ) : null}
        <ul className="relative" style={{ height: filas.length * FILA }} aria-label="Contactos de la cola">
          {visibles.map(({ r, i }, k) => {
            const pos = rango.desde + k;
            const hecho = hechos.get(r.id);
            const esActual = i === indice;
            const saltable = i > indice && !bloqueado;
            return (
              <li
                key={r.id}
                className="absolute inset-x-0 top-0 px-2 py-1 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] will-change-transform"
                style={{ height: FILA, transform: `translate3d(0, ${pos * FILA}px, 0)`, contain: "layout paint" }}
              >
                <button
                  type="button"
                  disabled={!saltable}
                  onClick={() => saltar(r.id)}
                  aria-current={esActual ? "true" : undefined}
                  title={saltable ? "Revisar ahora" : undefined}
                  className={`flex h-full w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-200 ${
                    esActual
                      ? "bg-icam-900 text-white shadow-sm"
                      : hecho
                        ? "opacity-55"
                        : saltable
                          ? "hover:bg-page"
                          : ""
                  }`}
                >
                  <span className={esActual ? "[&>span]:bg-white/15 [&>span]:text-white" : ""}>
                    <Avatar nombre={r.persona.nombre} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${esActual ? "text-white" : "text-text-primary"}`}>
                      {r.persona.nombre}
                    </span>
                    <span className={`block truncate text-xs ${esActual ? "text-white/70" : "text-text-muted"}`}>
                      {r.persona.empresa?.nombre ?? r.persona.email ?? "—"}
                    </span>
                  </span>
                  {hecho ? (
                    <Icon
                      name={hecho === "clasificar" ? "check" : "archive"}
                      className={`h-4 w-4 shrink-0 ${hecho === "clasificar" ? "text-emerald-600" : "text-text-muted"}`}
                    />
                  ) : esActual ? (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-icam-gold" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
});
