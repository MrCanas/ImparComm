"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { input } from "@/components/ui/styles";
import type { Etiqueta, TipoEtiqueta } from "@/modules/crm/types";

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Selector de etiquetas controlado. Muestra las elegidas como chips, sugiere las
 * existentes al escribir (para no duplicar «Inversor» / «Inversores») y permite
 * crear una nueva, general o personal.
 */
export function TagPicker({
  selected,
  all,
  onAdd,
  onRemove,
  onCreate,
  disabled = false,
  quick = false,
}: {
  selected: Etiqueta[];
  all: Etiqueta[];
  onAdd: (e: Etiqueta) => void;
  onRemove: (e: Etiqueta) => void;
  onCreate: (nombre: string, tipo: TipoEtiqueta) => Promise<Etiqueta | null>;
  disabled?: boolean;
  /** Muestra las generales como botones de un toque (ritual). */
  quick?: boolean;
}) {
  const [q, setQ] = useState("");
  const [tipoNueva, setTipoNueva] = useState<TipoEtiqueta>("general");
  const [creando, setCreando] = useState(false);
  const selectedIds = new Set(selected.map((e) => e.id));

  const sugerencias = useMemo(() => {
    const t = norm(q);
    if (!t) return [];
    return all.filter((e) => !selectedIds.has(e.id) && norm(e.nombre).includes(t)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, all, selected]);

  const existeExacta = all.some((e) => norm(e.nombre) === norm(q));

  async function crear() {
    const nombre = q.trim();
    if (!nombre) return;
    setCreando(true);
    const nueva = await onCreate(nombre, tipoNueva);
    setCreando(false);
    if (nueva) {
      onAdd(nueva);
      setQ("");
    }
  }

  const generalesRapidas = quick ? all.filter((e) => e.tipo === "general") : [];
  const personalesRapidas = quick ? all.filter((e) => e.tipo === "personal") : [];

  return (
    <div className="space-y-2">
      {quick ? (
        <div className="flex flex-wrap gap-1.5">
          {[...generalesRapidas, ...personalesRapidas].map((e) => {
            const on = selectedIds.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => (on ? onRemove(e) : onAdd(e))}
                className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${
                  on
                    ? "bg-icam-900 text-white"
                    : e.tipo === "general"
                      ? "border border-subtle bg-card text-text-body hover:border-icam-900"
                      : "border border-dashed border-icam-gold/70 bg-card text-[#7d6235]"
                }`}
              >
                {e.nombre}
              </button>
            );
          })}
        </div>
      ) : selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => (
            <span
              key={e.id}
              className={`inline-flex min-h-8 items-center gap-1 rounded-full pl-3 pr-1 text-sm font-medium ${
                e.tipo === "general" ? "bg-icam-900/10 text-icam-900" : "border border-dashed border-icam-gold/70 text-[#7d6235]"
              }`}
            >
              {e.nombre}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(e)}
                aria-label={`Quitar ${e.nombre}`}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (sugerencias[0]) {
                onAdd(sugerencias[0]);
                setQ("");
              } else if (!existeExacta) {
                void crear();
              }
            }
          }}
          disabled={disabled}
          placeholder={quick ? "Otra etiqueta…" : "Añadir etiqueta…"}
          className={input}
          aria-label="Buscar o crear etiqueta"
        />
        {q.trim() ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-subtle bg-card shadow-lg">
            {sugerencias.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onAdd(e);
                  setQ("");
                }}
                className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-page"
              >
                <span>{e.nombre}</span>
                <span className="text-xs text-text-muted">{e.tipo === "general" ? "General" : "Personal"}</span>
              </button>
            ))}
            {!existeExacta ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-subtle/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void crear()}
                  disabled={creando}
                  className="min-h-9 rounded-md bg-icam-900 px-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {creando ? "Creando…" : `Crear «${q.trim()}»`}
                </button>
                <div className="flex rounded-md border border-subtle text-xs" role="radiogroup" aria-label="Tipo de etiqueta">
                  {(["general", "personal"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={tipoNueva === t}
                      onClick={() => setTipoNueva(t)}
                      className={`min-h-9 px-3 font-medium ${tipoNueva === t ? "bg-icam-900/10 text-icam-900" : "text-text-muted"}`}
                    >
                      {t === "general" ? "General" : "Personal"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
