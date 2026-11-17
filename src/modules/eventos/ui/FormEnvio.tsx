"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import type { Filtro } from "@/lib/eventos/filtros";

import { crearEnvio, editarEnvio } from "../actions";
import { TIPOS_PLANTILLA, type Envio, type Plantilla } from "../types";
import { Segmento } from "./Segmento";

export function FormEnvio({
  eventoId,
  plantillas,
  etiquetas,
  origenes,
  envio,
  delayMinS,
  onGuardado,
}: {
  eventoId: string;
  plantillas: Plantilla[];
  etiquetas: string[];
  origenes: string[];
  envio?: Envio;
  delayMinS: number;
  onGuardado?: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(envio?.nombre ?? "");
  const [plantillaId, setPlantillaId] = useState(envio?.plantilla_id ?? plantillas[0]?.id ?? "");
  const [delayS, setDelayS] = useState(envio ? envio.delay_ms / 1000 : Math.max(5, delayMinS));
  const [filtro, setFiltro] = useState<Filtro>(envio?.filtro ?? { respuestas: ["sin_respuesta"], noRecibidoTipo: "invitacion" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  function guardar() {
    setError(null);
    if (!plantillaId) return setError("Elige una plantilla");
    start(async () => {
      const datos = { nombre, plantillaId, filtro, delayS };
      const r = envio ? await editarEnvio(envio.id, datos) : await crearEnvio(eventoId, datos);
      if (!r.ok) return setError(r.error);
      if (!envio && r.data) router.push(`/eventos/${eventoId}/envios/${r.data.id}`);
      else {
        onGuardado?.();
        router.refresh();
      }
    });
  }

  if (!plantillas.length) return <p className="text-sm text-text-muted">Crea primero una plantilla.</p>;

  return (
    <div className={`${card} space-y-4 p-4`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Nombre del envío</label>
          <input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Piloto 50 · Invitación" />
        </div>
        <div>
          <label className={label}>Plantilla</label>
          <select className={input} value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({TIPOS_PLANTILLA.find((t) => t.tipo === p.tipo)?.etiqueta}, v{p.version})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Segundos entre correos (mín. {delayMinS})</label>
          <input type="number" min={delayMinS} step={1} className={input} value={delayS} onChange={(e) => setDelayS(Math.max(delayMinS, Number(e.target.value)))} />
          <p className="mt-1 text-xs text-text-muted">≈ {Math.round(3600 / Math.max(delayS, 1))} correos por hora</p>
        </div>
      </div>
      <Segmento eventoId={eventoId} envioId={envio?.id ?? null} filtro={filtro} onChange={setFiltro} etiquetas={etiquetas} origenes={origenes} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="button" className={btn.primary} onClick={guardar} disabled={pendiente}>
        {pendiente ? "Guardando…" : envio ? "Guardar cambios (se aplican al reanudar)" : "Crear envío (no envía nada todavía)"}
      </button>
    </div>
  );
}
