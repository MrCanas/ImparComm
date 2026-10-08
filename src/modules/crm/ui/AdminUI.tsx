"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card, input, label } from "@/components/ui/styles";
import { fmtFecha } from "@/lib/format";
import {
  adoptarRelacion,
  cambiarPlazo,
  convertirEnGeneral,
  fusionarEtiquetas,
  guardarConfig,
  guardarPermiso,
  marcarBonoEntregado,
  quitarPermiso,
} from "@/modules/crm/actions";
import type { Etiqueta } from "@/modules/crm/types";

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

function useRun(): [Run, boolean, string] {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const run: Run = (fn) => {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else router.refresh();
    });
  };
  return [run, pending, error];
}

function ErrorMsg({ error }: { error: string }) {
  return error ? <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

// ─── Equipo ──────────────────────────────────────────────────────────────────

export interface ResumenEmpleado {
  empleado_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  nuevas: number;
  clasificadas: number;
  archivadas: number;
  vencidas: number;
  puntos: number;
  bonos: number;
  bonos_pendientes: number;
}

export function ResumenEquipo({ filas }: { filas: ResumenEmpleado[] }) {
  if (filas.length === 0) {
    return <EmptyState title="Sin actividad todavía">Cuando los empleados tengan contactos aparecerán aquí.</EmptyState>;
  }
  const cols: { k: keyof ResumenEmpleado; t: string }[] = [
    { k: "nuevas", t: "Por clasificar" },
    { k: "clasificadas", t: "Clasificados" },
    { k: "archivadas", t: "Archivados" },
    { k: "vencidas", t: "Vencidos" },
    { k: "puntos", t: "Puntos" },
    { k: "bonos", t: "Bonos" },
  ];
  return (
    <>
      <ul className="space-y-2 lg:hidden">
        {filas.map((f) => (
          <li key={f.empleado_id} className={`${card} p-3`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-medium text-text-primary">{f.nombre}</span>
                <span className="block truncate text-xs text-text-muted">{f.email}</span>
              </span>
              {!f.activo ? <Badge tone="muted">Baja</Badge> : null}
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              {cols.map((c) => (
                <div key={c.k} className="rounded-md bg-page py-1.5">
                  <dd className="font-semibold">{String(f[c.k])}</dd>
                  <dt className="text-[11px] text-text-muted">{c.t}</dt>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className={`${card} hidden overflow-hidden lg:block`}>
        <table className="w-full text-sm">
          <thead className="border-b border-subtle bg-page/60 text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Empleado</th>
              {cols.map((c) => (
                <th key={c.k} className="px-4 py-3 text-right font-medium">{c.t}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle/60">
            {filas.map((f) => (
              <tr key={f.empleado_id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-text-primary">{f.nombre}</span>{" "}
                  {!f.activo ? <Badge tone="muted">Baja</Badge> : null}
                  <span className="block text-xs text-text-muted">{f.email}</span>
                </td>
                {cols.map((c) => (
                  <td key={c.k} className={`px-4 py-3 text-right tabular-nums ${c.k === "vencidas" && f.vencidas > 0 ? "text-red-700 font-medium" : ""}`}>
                    {String(f[c.k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

export function EtiquetasAdmin({ etiquetas }: { etiquetas: (Etiqueta & { usos: number })[] }) {
  const [run, pending, error] = useRun();
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const generales = etiquetas.filter((e) => e.tipo === "general");
  const personales = etiquetas.filter((e) => e.tipo === "personal");

  return (
    <div className="space-y-6">
      <ErrorMsg error={error} />
      <section>
        <SectionTitle>Etiquetas generales y plazo de recordatorio</SectionTitle>
        <ul className={`${card} divide-y divide-subtle/60`}>
          {generales.map((e) => (
            <PlazoRow key={e.id} e={e} run={run} pending={pending} />
          ))}
        </ul>
        <p className="mt-1 text-xs text-text-muted">Con varias etiquetas manda el plazo más corto.</p>
      </section>

      <section className={`${card} p-4`}>
        <SectionTitle>Fusionar duplicadas</SectionTitle>
        <p className="mb-3 text-sm text-text-muted">Las personas y hitos de la primera pasan a la segunda, y la primera se borra.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={input} aria-label="Etiqueta a eliminar">
            <option value="">Fusionar…</option>
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} ({e.tipo}, {e.usos})</option>
            ))}
          </select>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={input} aria-label="Etiqueta destino">
            <option value="">…en</option>
            {etiquetas.filter((e) => e.id !== origen).map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} ({e.tipo}, {e.usos})</option>
            ))}
          </select>
          <button
            type="button"
            className={btn.primary}
            disabled={pending || !origen || !destino}
            onClick={() =>
              run(async () => {
                const r = await fusionarEtiquetas(origen, destino);
                if (r.ok) {
                  setOrigen("");
                  setDestino("");
                }
                return r;
              })
            }
          >
            Fusionar
          </button>
        </div>
      </section>

      {personales.length > 0 ? (
        <section>
          <SectionTitle>Etiquetas personales del equipo</SectionTitle>
          <ul className={`${card} divide-y divide-subtle/60`}>
            {personales.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="text-sm">
                  {e.nombre} <span className="text-xs text-text-muted">· {e.usos} personas</span>
                </span>
                <button type="button" className={`${btn.ghost} min-h-9 px-3 text-xs`} disabled={pending} onClick={() => run(() => convertirEnGeneral(e.id))}>
                  Hacer general
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PlazoRow({ e, run, pending }: { e: Etiqueta & { usos: number }; run: Run; pending: boolean }) {
  const [dias, setDias] = useState(String(e.plazo_dias));
  const cambiado = Number(dias) !== e.plazo_dias;
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{e.nombre}</span>
        <span className="text-xs text-text-muted">{e.usos} personas</span>
      </span>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={dias}
        onChange={(ev) => setDias(ev.target.value)}
        className={`${input} w-20 text-right`}
        aria-label={`Plazo de ${e.nombre} en días`}
      />
      <span className="text-xs text-text-muted">días</span>
      <button
        type="button"
        className={`${btn.secondary} min-h-10 px-3`}
        disabled={!cambiado || pending}
        onClick={() => run(() => cambiarPlazo(e.id, Number(dias)))}
      >
        Guardar
      </button>
    </li>
  );
}

export function ConfigAdmin({ valores }: { valores: { plazo_defecto_dias: number; puntos_por_bono: number; importe_bono: number } }) {
  const [run, pending, error] = useRun();
  const [v, setV] = useState(valores);
  const campos: { k: keyof typeof valores; t: string }[] = [
    { k: "plazo_defecto_dias", t: "Plazo por defecto (días)" },
    { k: "puntos_por_bono", t: "Puntos por bono" },
    { k: "importe_bono", t: "Importe del bono (€)" },
  ];
  return (
    <section className={`${card} p-4`}>
      <SectionTitle>Parámetros</SectionTitle>
      <ErrorMsg error={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        {campos.map((c) => (
          <div key={c.k}>
            <label className={label} htmlFor={`cfg-${c.k}`}>{c.t}</label>
            <div className="flex gap-2">
              <input
                id={`cfg-${c.k}`}
                type="number"
                min={1}
                value={v[c.k]}
                onChange={(e) => setV({ ...v, [c.k]: Number(e.target.value) })}
                className={input}
              />
              <button
                type="button"
                className={`${btn.secondary} px-3`}
                disabled={pending || v[c.k] === valores[c.k]}
                onClick={() => run(() => guardarConfig(c.k, v[c.k]))}
              >
                OK
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Bonos ───────────────────────────────────────────────────────────────────

export function BonosAdmin({
  bonos,
}: {
  bonos: { id: string; empleado: string; fecha: string; importe: number; estado: string }[];
}) {
  const [run, pending, error] = useRun();
  if (bonos.length === 0) {
    return <EmptyState title="Aún no se ha generado ningún bono">Se genera uno automáticamente cada vez que un empleado llega al umbral de puntos.</EmptyState>;
  }
  return (
    <>
      <ErrorMsg error={error} />
      <p className="mb-3 text-xs text-text-muted">
        Tarjeta regalo de El Corte Inglés. Es retribución en especie: va en nómina y tributa en IRPF (pendiente de confirmar con la gestoría).
      </p>
      <ul className={`${card} divide-y divide-subtle/60`}>
        {bonos.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{b.empleado}</span>
              <span className="text-xs text-text-muted">{fmtFecha(b.fecha)} · {Number(b.importe).toLocaleString("es-ES")} €</span>
            </span>
            <Badge tone={b.estado === "entregado" ? "green" : "gold"}>{b.estado === "entregado" ? "Entregado" : "Pendiente"}</Badge>
            <button
              type="button"
              className={`${btn.secondary} min-h-10 px-3`}
              disabled={pending}
              onClick={() => run(() => marcarBonoEntregado(b.id, b.estado !== "entregado"))}
            >
              {b.estado === "entregado" ? "Marcar pendiente" : "Marcar entregado"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─── Permisos ────────────────────────────────────────────────────────────────

export function PermisosAdmin({ filas }: { filas: { user_id: string; nombre: string; es_admin: boolean; ve_bolsa: boolean }[] }) {
  const [run, pending, error] = useRun();
  return (
    <div className="space-y-4">
      <ErrorMsg error={error} />
      <form
        className={`${card} grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end`}
        action={(fd) => run(() => guardarPermiso(fd))}
      >
        <div>
          <label className={label} htmlFor="perm-email">Email del empleado</label>
          <input id="perm-email" name="email" type="email" required className={input} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="es_admin" className="h-4 w-4 accent-icam-900" /> Administrador
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="ve_bolsa" className="h-4 w-4 accent-icam-900" /> Bolsa común
        </label>
        <button type="submit" className={btn.primary} disabled={pending}>Guardar</button>
      </form>
      <p className="text-xs text-text-muted">Los superadministradores de icam web dashboard son administradores aquí automáticamente.</p>
      {filas.length > 0 ? (
        <ul className={`${card} divide-y divide-subtle/60`}>
          {filas.map((f) => (
            <li key={f.user_id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1 font-medium">{f.nombre}</span>
              {f.es_admin ? <Badge tone="navy">Admin</Badge> : null}
              {f.ve_bolsa ? <Badge tone="gold">Bolsa común</Badge> : null}
              <button type="button" className={`${btn.ghost} min-h-9 px-3 text-xs`} disabled={pending} onClick={() => run(() => quitarPermiso(f.user_id))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── Bolsa común ─────────────────────────────────────────────────────────────

export interface BolsaItem {
  relacion_id: string;
  persona_id: string;
  persona_nombre: string;
  persona_email: string | null;
  empresa: string | null;
  estado: string;
  ultima_reunion: string | null;
  empleado_nombre: string;
}

export function BolsaList({ items }: { items: BolsaItem[] }) {
  const [run, pending, error] = useRun();
  if (items.length === 0) {
    return <EmptyState title="La bolsa común está vacía">Cuando un empleado cause baja, sus contactos aparecerán aquí.</EmptyState>;
  }
  return (
    <>
      <ErrorMsg error={error} />
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.relacion_id} className={`${card} flex flex-wrap items-center gap-3 p-3`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-text-primary">{i.persona_nombre}</span>
              <span className="block truncate text-xs text-text-muted">
                {[i.empresa, i.persona_email].filter(Boolean).join(" · ")} · de {i.empleado_nombre}
              </span>
            </span>
            <button type="button" className={`${btn.primary} min-h-10`} disabled={pending} onClick={() => run(() => adoptarRelacion(i.relacion_id))}>
              Adoptar
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
