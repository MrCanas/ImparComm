"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge, ESTADO_RELACION } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/PageHeader";
import { btn, card, input } from "@/components/ui/styles";
import { fmtFechaCorta, hoyMadrid } from "@/lib/format";
import type { Etiqueta, Relacion } from "@/modules/crm/types";

type Filtro = "activos" | "nueva" | "clasificada" | "archivada" | "vencidos";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "activos", label: "Activos" },
  { key: "nueva", label: "Nuevos" },
  { key: "clasificada", label: "Clasificados" },
  { key: "vencidos", label: "Vencidos" },
  { key: "archivada", label: "Archivados" },
];

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ContactList({ relaciones, etiquetas }: { relaciones: Relacion[]; etiquetas: Etiqueta[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const [etiqueta, setEtiqueta] = useState("");
  const hoy = hoyMadrid();

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { activos: 0, nueva: 0, clasificada: 0, archivada: 0, vencidos: 0 };
    for (const r of relaciones) {
      c[r.estado] += 1;
      if (r.estado !== "archivada") c.activos += 1;
      if (r.estado === "clasificada" && r.proximo_recordatorio && r.proximo_recordatorio <= hoy) c.vencidos += 1;
    }
    return c;
  }, [relaciones, hoy]);

  const visibles = useMemo(() => {
    const term = normalizar(q.trim());
    return relaciones.filter((r) => {
      if (filtro === "activos" && r.estado === "archivada") return false;
      if (filtro === "vencidos" && !(r.estado === "clasificada" && r.proximo_recordatorio && r.proximo_recordatorio <= hoy)) return false;
      if ((filtro === "nueva" || filtro === "clasificada" || filtro === "archivada") && r.estado !== filtro) return false;
      if (etiqueta && !r.persona.etiquetas.some((e) => e.id === etiqueta)) return false;
      if (!term) return true;
      const p = r.persona;
      return normalizar([p.nombre, p.email, p.empresa?.nombre, p.cargo, p.telefono].filter(Boolean).join(" ")).includes(term);
    });
  }, [relaciones, q, filtro, etiqueta, hoy]);

  if (relaciones.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes contactos"
        action={<Link href="/contactos/nuevo" className={btn.primary}>Añadir el primero</Link>}
      >
        Cuando se conecte tu calendario aparecerán aquí las personas externas de tus reuniones. Mientras tanto
        puedes añadirlas a mano, por ejemplo tras una comida.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, empresa, email…"
            className={`${input} pl-9`}
          />
        </label>
        <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className={`${input} sm:w-56`} aria-label="Filtrar por etiqueta">
          <option value="">Todas las etiquetas</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.tipo === "personal" ? " (personal)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto no-scrollbar px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Estado">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filtro === f.key}
            onClick={() => setFiltro(f.key)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-medium transition ${
              filtro === f.key ? "bg-icam-900 text-white" : "border border-subtle bg-card text-text-body hover:bg-page"
            }`}
          >
            {f.label} <span className={filtro === f.key ? "text-white/70" : "text-text-muted"}>{conteo[f.key]}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <EmptyState title="Sin resultados">Prueba con otro filtro o búsqueda.</EmptyState>
      ) : (
        <>
          {/* Móvil y tablet: tarjetas */}
          <ul className="space-y-2 lg:hidden">
            {visibles.map((r) => (
              <li key={r.id}>
                <Link href={`/contactos/${r.persona.id}`} className={`${card} flex items-center gap-3 p-3 active:bg-page`}>
                  <Avatar nombre={r.persona.nombre} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-text-primary">{r.persona.nombre}</span>
                      {r.estado !== "clasificada" ? (
                        <Badge tone={ESTADO_RELACION[r.estado].tone}>{ESTADO_RELACION[r.estado].label}</Badge>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {[r.persona.cargo, r.persona.empresa?.nombre].filter(Boolean).join(" · ") || r.persona.email || r.persona.telefono}
                    </span>
                    {r.persona.etiquetas.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.persona.etiquetas.slice(0, 3).map((e) => (
                          <Badge key={e.id} tone={e.tipo === "general" ? "navy" : "outline"}>{e.nombre}</Badge>
                        ))}
                        {r.persona.etiquetas.length > 3 ? <Badge tone="muted">+{r.persona.etiquetas.length - 3}</Badge> : null}
                      </span>
                    ) : null}
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <div className={`${card} hidden overflow-hidden lg:block`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-subtle bg-page/60 text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Etiquetas</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Recordatorio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle/60">
                {visibles.map((r) => {
                  const vencido = r.estado === "clasificada" && r.proximo_recordatorio && r.proximo_recordatorio <= hoy;
                  return (
                    <tr key={r.id} className="group hover:bg-page">
                      <td className="px-4 py-3">
                        <Link href={`/contactos/${r.persona.id}`} className="block">
                          <span className="block font-medium text-text-primary group-hover:underline">{r.persona.nombre}</span>
                          <span className="block text-xs text-text-muted">{r.persona.email ?? r.persona.telefono}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block">{r.persona.empresa?.nombre ?? "—"}</span>
                        <span className="block text-xs text-text-muted">{r.persona.cargo}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {r.persona.etiquetas.map((e) => (
                            <Badge key={e.id} tone={e.tipo === "general" ? "navy" : "outline"}>{e.nombre}</Badge>
                          ))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ESTADO_RELACION[r.estado].tone}>{ESTADO_RELACION[r.estado].label}</Badge>
                      </td>
                      <td className={`px-4 py-3 ${vencido ? "font-medium text-red-700" : "text-text-muted"}`}>
                        {r.proximo_recordatorio ? fmtFechaCorta(r.proximo_recordatorio) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function Avatar({ nombre, size = "md" }: { nombre: string; size?: "md" | "lg" }) {
  const partes = nombre.trim().split(/\s+/);
  const ini = `${partes[0]?.[0] ?? ""}${partes.length > 1 ? partes[partes.length - 1]![0] : ""}`.toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-icam-900/10 font-semibold text-icam-900 ${
        size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"
      }`}
      aria-hidden="true"
    >
      {ini}
    </span>
  );
}
