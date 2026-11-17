"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { btn, card, input, label } from "@/components/ui/styles";
import type { TipoPlantilla } from "@/lib/eventos/render/tipos";

import { crearPlantilla } from "../actions";
import { TIPOS_PLANTILLA, type Plantilla } from "../types";
import { fechaHora } from "./comun";

export function PlantillasLista({ eventoId, plantillas }: { eventoId: string; plantillas: Plantilla[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPlantilla>("invitacion");
  const [nombre, setNombre] = useState("");
  const [modo, setModo] = useState<"bloques" | "html">("bloques");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  function crear() {
    setError(null);
    start(async () => {
      const r = await crearPlantilla(eventoId, tipo, nombre || TIPOS_PLANTILLA.find((t) => t.tipo === tipo)!.etiqueta, modo);
      if (!r.ok) return setError(r.error);
      router.push(`/eventos/${eventoId}/plantillas/${r.data!.id}`);
    });
  }

  return (
    <div className="space-y-4">
      {plantillas.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plantillas.map((p) => (
            <li key={p.id}>
              <Link href={`/eventos/${eventoId}/plantillas/${p.id}`} className={`${card} block p-4 hover:border-icam-900/30`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-text-primary">{p.nombre}</p>
                  <Badge tone="navy">{TIPOS_PLANTILLA.find((t) => t.tipo === p.tipo)?.etiqueta}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-text-muted">{p.asunto}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {p.modo === "html" ? "HTML propio" : "Bloques de marca"} · versión {p.version} · {fechaHora(p.updated_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Aún no hay plantillas.</p>
      )}
      <div className={`${card} grid gap-3 p-4 sm:grid-cols-4 sm:items-end`}>
        <div>
          <label className={label}>Tipo</label>
          <select className={input} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPlantilla)}>
            {TIPOS_PLANTILLA.map((t) => (
              <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Nombre</label>
          <input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Invitación principal" />
        </div>
        <div>
          <label className={label}>Modo</label>
          <select className={input} value={modo} onChange={(e) => setModo(e.target.value as "bloques" | "html")}>
            <option value="bloques">Bloques de marca</option>
            <option value="html">HTML del diseñador</option>
          </select>
        </div>
        <button type="button" className={btn.primary} onClick={crear} disabled={pendiente}>Nueva plantilla</button>
        {error ? <p className="text-sm text-red-700 sm:col-span-4">{error}</p> : null}
      </div>
    </div>
  );
}
