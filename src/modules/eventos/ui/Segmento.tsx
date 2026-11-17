"use client";

import { useEffect, useState, useTransition } from "react";

import { input, label } from "@/components/ui/styles";
import type { EstadoRespuesta, Filtro } from "@/lib/eventos/filtros";

import { previsualizarSegmento, type VistaSegmento } from "../actions";
import { ETIQUETA_RESPUESTA, TIPOS_PLANTILLA } from "../types";

/** Editor de segmento con vista previa en vivo de a quién va (calculada en el servidor). */
export function Segmento({
  eventoId,
  envioId,
  filtro,
  onChange,
  etiquetas,
  origenes,
}: {
  eventoId: string;
  envioId: string | null;
  filtro: Filtro;
  onChange: (f: Filtro) => void;
  etiquetas: string[];
  origenes: string[];
}) {
  const [vista, setVista] = useState<VistaSegmento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [manual, setManual] = useState(Boolean(filtro.ids?.length));

  // En modo manual, la lista muestra los candidatos (sin filtrar por los marcados).
  const clave = JSON.stringify(manual ? { ...filtro, ids: undefined, limite: undefined } : filtro);
  useEffect(() => {
    const t = setTimeout(() => {
      start(async () => {
        const r = await previsualizarSegmento(eventoId, JSON.parse(clave) as Filtro, envioId);
        if (!r.ok) return setError(r.error);
        setError(null);
        setVista(r.data!);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [clave, eventoId, envioId]);

  const toggle = <T,>(lista: T[] | undefined, v: T): T[] => (lista?.includes(v) ? lista.filter((x) => x !== v) : [...(lista ?? []), v]);
  const set = (p: Partial<Filtro>) => onChange({ ...filtro, ...p });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={label}>Respuesta</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["sin_respuesta", "si", "quizas", "no"] as EstadoRespuesta[]).map((r) => (
              <label key={r} className="flex items-center gap-1">
                <input type="checkbox" checked={filtro.respuestas?.includes(r) ?? false} onChange={() => set({ respuestas: toggle(filtro.respuestas, r) })} />
                {ETIQUETA_RESPUESTA[r]}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1 text-sm">
            <input type="checkbox" checked={filtro.conAcompanante === true} onChange={(e) => set({ conAcompanante: e.target.checked ? true : undefined })} />
            Solo con acompañante
          </label>
        </div>
        <div>
          <label className={label}>Excluir a quien ya recibió…</label>
          <select className={input} value={filtro.noRecibidoTipo ?? ""} onChange={(e) => set({ noRecibidoTipo: e.target.value || undefined })}>
            <option value="">(no excluir)</option>
            {TIPOS_PLANTILLA.map((t) => (
              <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <p className={label}>Etiquetas</p>
          <div className="flex max-h-32 flex-wrap gap-2 overflow-auto text-sm">
            {etiquetas.length ? etiquetas.map((e) => (
              <label key={e} className="flex items-center gap-1">
                <input type="checkbox" checked={filtro.etiquetas?.includes(e) ?? false} onChange={() => set({ etiquetas: toggle(filtro.etiquetas, e) })} />
                {e}
              </label>
            )) : <span className="text-text-muted">Sin etiquetas</span>}
          </div>
          {(filtro.etiquetas?.length ?? 0) > 1 ? (
            <label className="mt-1 flex items-center gap-1 text-xs">
              <input type="checkbox" checked={filtro.todasEtiquetas ?? false} onChange={(e) => set({ todasEtiquetas: e.target.checked })} />
              Debe tener todas
            </label>
          ) : null}
        </div>
        <div>
          <p className={label}>Origen</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {origenes.length ? origenes.map((o) => (
              <label key={o} className="flex items-center gap-1">
                <input type="checkbox" checked={filtro.origenes?.includes(o) ?? false} onChange={() => set({ origenes: toggle(filtro.origenes, o) })} />
                {o}
              </label>
            )) : <span className="text-text-muted">—</span>}
          </div>
        </div>
        <div>
          <label className={label}>Empresas (separadas por comas)</label>
          <input className={input} defaultValue={filtro.empresas?.join(", ") ?? ""} onBlur={(e) => set({ empresas: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        </div>
        <div>
          <label className={label}>Dominios (separados por comas)</label>
          <input className={input} defaultValue={filtro.dominios?.join(", ") ?? ""} onBlur={(e) => set({ dominios: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} placeholder="yopmail.com" />
        </div>
        <div>
          <label className={label}>Buscar (nombre, email, empresa)</label>
          <input className={input} defaultValue={filtro.buscar ?? ""} onBlur={(e) => set({ buscar: e.target.value || undefined })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Máximo de destinatarios</label>
            <input type="number" min={1} className={input} value={filtro.limite ?? ""} onChange={(e) => set({ limite: e.target.value ? Number(e.target.value) : undefined })} placeholder="Todos" />
          </div>
          <div>
            <label className={label}>Orden</label>
            <select className={input} value={filtro.orden ?? "alta"} onChange={(e) => set({ orden: e.target.value as Filtro["orden"], semilla: e.target.value === "aleatorio" ? (filtro.semilla ?? Date.now() % 100000) : filtro.semilla })}>
              <option value="alta">Orden de alta</option>
              <option value="nombre">Nombre</option>
              <option value="empresa">Empresa</option>
              <option value="aleatorio">Aleatorio (fijo)</option>
            </select>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={manual} onChange={(e) => { setManual(e.target.checked); if (!e.target.checked) set({ ids: undefined }); }} />
        Elegir a mano, uno a uno (para el piloto)
      </label>

      <div className="rounded-md bg-page p-3 text-sm">
        {pendiente && !vista ? <p className="text-text-muted">Calculando…</p> : null}
        {vista ? (
          <>
            <p>
              <strong className="text-lg text-text-primary">{manual ? (filtro.ids?.length ?? 0) : vista.total}</strong> destinatarios
              {manual ? <span className="text-text-muted"> (marcados de {vista.total} candidatos)</span> : null}
              {vista.yaTratados ? <span className="text-text-muted"> · {vista.yaTratados} ya tratados en este envío</span> : null}
              {vista.bloqueados.length ? <span className="text-amber-700"> · {vista.bloqueados.length} excluidos (baja, rebote o exclusión)</span> : null}
              {pendiente ? <span className="text-text-muted"> · actualizando…</span> : null}
            </p>
            <ul className="mt-2 max-h-72 overflow-auto">
              {(manual ? vista.muestra : vista.muestra.slice(0, 100)).map((m) => (
                <li key={m.id} className="flex items-center gap-2 border-b border-subtle/40 py-1">
                  {manual ? (
                    <input
                      type="checkbox"
                      checked={filtro.ids?.includes(m.id) ?? false}
                      onChange={() => set({ ids: toggle(filtro.ids, m.id) })}
                    />
                  ) : null}
                  <span className="text-text-primary">{m.nombre ?? "—"}</span>
                  <span className="text-xs text-text-muted">{m.email}</span>
                  <span className="ml-auto text-xs text-text-muted">{m.empresa}</span>
                </li>
              ))}
            </ul>
            {manual ? (
              <p className="mt-2 text-xs text-text-muted">
                Con la selección manual, solo se envía a los marcados ({filtro.ids?.length ?? 0}). La lista muestra hasta 500 candidatos: afina con los filtros de arriba.
              </p>
            ) : vista.muestra.length > 100 ? (
              <p className="mt-1 text-xs text-text-muted">Se muestran los 100 primeros.</p>
            ) : null}
            {vista.bloqueados.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">Ver excluidos</summary>
                <ul className="text-xs text-text-muted">{vista.bloqueados.map((b) => <li key={b.email}>{b.email} — {b.motivo}</li>)}</ul>
              </details>
            ) : null}
          </>
        ) : null}
        {error ? <p className="text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
