"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SECUENCIAL, SERIE, TINTA } from "@/components/charts/palette";

const nf = (n: number) => n.toLocaleString("es-ES");

function fechaCorta(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

interface TipPayload {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

function Tip({ active, payload, label, fecha }: { active?: boolean; payload?: TipPayload[]; label?: string | number; fecha?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-subtle bg-card px-3 py-2 text-xs shadow-lg">
      {label !== undefined ? <p className="mb-1 font-semibold text-text-primary">{fecha ? fechaCorta(String(label)) : label}</p> : null}
      {payload.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 text-text-body">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="font-semibold tabular-nums">{nf(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

function Leyenda({ items }: { items: { label: string; color: string; value?: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
          {i.value !== undefined ? <span className="font-semibold tabular-nums text-text-primary">{nf(i.value)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export interface Serie {
  key: string;
  label: string;
}

/** Áreas suavizadas en el tiempo (eje X = fecha ISO). Una sola escala Y. */
export function AreaTrend({
  data,
  xKey,
  series,
  height = 220,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: Serie[];
  height?: number;
}) {
  const reducido = useReducedMotion();
  return (
    <div className="space-y-2">
      {series.length > 1 ? <Leyenda items={series.map((s, i) => ({ label: s.label, color: SERIE[i] }))} /> : null}
      <div style={{ height }} className="-ml-3">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE[i]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIE[i]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={TINTA.grid} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={fechaCorta} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<Tip fecha />} cursor={{ stroke: TINTA.muted, strokeDasharray: "3 3" }} />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={SERIE[i]}
                strokeWidth={2}
                fill={`url(#g-${s.key})`}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={!reducido}
                animationDuration={1100}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Donut con el total en el centro y leyenda con valores (identidad nunca solo por color). */
export function DonutChart({ data, centro, height = 190 }: { data: { name: string; value: number }[]; centro?: string; height?: number }) {
  const reducido = useReducedMotion();
  const [activo, setActivo] = useState<number | null>(null);
  // Más de 6 categorías: el resto se agrupa en «Otros».
  const top = [...data].sort((a, b) => b.value - a.value);
  const datos = top.length > 6 ? [...top.slice(0, 5), { name: "Otros", value: top.slice(5).reduce((s, d) => s + d.value, 0) }] : top;
  const total = datos.reduce((s, d) => s + d.value, 0);

  if (total === 0) return <p className="py-8 text-center text-sm text-text-muted">Sin datos todavía</p>;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: height, height }}>
          <PieChart>
            <Pie
              data={datos}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
              cornerRadius={4}
              isAnimationActive={!reducido}
              animationDuration={900}
              onMouseEnter={(_, i) => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            >
              {datos.map((d, i) => (
                <Cell key={d.name} fill={SERIE[i % SERIE.length]} opacity={activo === null || activo === i ? 1 : 0.45} />
              ))}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-text-primary">{nf(activo !== null ? datos[activo].value : total)}</span>
          <span className="max-w-[60%] truncate text-[11px] text-text-muted">{activo !== null ? datos[activo].name : (centro ?? "Total")}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {datos.map((d, i) => (
          <li
            key={d.name}
            className={`flex items-center gap-2 rounded px-1 transition ${activo === i ? "bg-page" : ""}`}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIE[i % SERIE.length] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-text-body">{d.name}</span>
            <span className="tabular-nums font-semibold text-text-primary">{nf(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-text-muted">{Math.round((d.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras verticales de una serie (categorías ordinales: un solo tono). */
export function Columnas({
  data,
  xKey,
  yKey,
  label,
  height = 200,
  fecha = false,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  label: string;
  height?: number;
  fecha?: boolean;
}) {
  const reducido = useReducedMotion();
  return (
    <div style={{ height }} className="-ml-3">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={TINTA.grid} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={fecha ? fechaCorta : undefined} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<Tip fecha={fecha} />} cursor={{ fill: "rgb(30 42 86 / 0.06)" }} />
          <Bar dataKey={yKey} name={label} fill={SERIE[0]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reducido} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras agrupadas de dos series en el tiempo (p. ej. semanal del equipo). */
export function ColumnasDobles({ data, xKey, series, height = 220 }: { data: Record<string, unknown>[]; xKey: string; series: Serie[]; height?: number }) {
  const reducido = useReducedMotion();
  return (
    <div className="space-y-2">
      <Leyenda items={series.map((s, i) => ({ label: s.label, color: SERIE[i] }))} />
      <div style={{ height }} className="-ml-3">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke={TINTA.grid} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={fechaCorta} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA.muted }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<Tip fecha />} cursor={{ fill: "rgb(30 42 86 / 0.06)" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIE[i]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!reducido} animationDuration={900} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Ranking con barras horizontales que se reordenan con animación de layout.
 * Una sola serie: un solo tono; la fila propia se resalta con texto, no con color.
 */
export function BarRanking({
  items,
  unidad = "XP",
  destacar,
}: {
  items: { id: string; nombre: string; valor: number; detalle?: string }[];
  unidad?: string;
  destacar?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.valor));
  const medallas = ["🥇", "🥈", "🥉"];
  return (
    <ol className="space-y-2">
      {items.map((it, idx) => (
        <motion.li
          key={it.id}
          layout
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className={`rounded-md px-2 py-1.5 ${it.id === destacar ? "bg-icam-gold/10 ring-1 ring-icam-gold/40" : ""}`}
        >
          <div className="mb-1 flex items-center gap-2 text-sm">
            <span className="w-6 text-center tabular-nums text-text-muted">{medallas[idx] ?? idx + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
              {it.nombre}
              {it.id === destacar ? <span className="ml-1 text-xs font-normal text-text-muted">(tú)</span> : null}
            </span>
            <span className="tabular-nums font-semibold text-text-primary">
              {nf(it.valor)} <span className="text-xs font-normal text-text-muted">{unidad}</span>
            </span>
          </div>
          <div className="ml-8 h-2 overflow-hidden rounded-full bg-subtle">
            <motion.div
              className="h-full rounded-full"
              style={{ background: SERIE[0] }}
              initial={{ width: 0 }}
              animate={{ width: `${(it.valor / max) * 100}%` }}
              transition={{ duration: 0.9, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {it.detalle ? <p className="ml-8 mt-0.5 text-xs text-text-muted">{it.detalle}</p> : null}
        </motion.li>
      ))}
    </ol>
  );
}

/** Embudo por hito: incluidos frente a contactados, con barra de avance. */
export function Funnel({ items }: { items: { id: string; nombre: string; incluidos: number; contactados: number }[] }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-text-muted">Aún no hay invitados en hitos</p>;
  return (
    <ul className="space-y-3">
      {items.map((h, i) => {
        const pct = h.incluidos ? h.contactados / h.incluidos : 0;
        return (
          <li key={h.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-text-primary">{h.nombre}</span>
              <span className="shrink-0 text-xs tabular-nums text-text-muted">
                <span className="font-semibold text-text-primary">{h.contactados}</span> / {h.incluidos} · {Math.round(pct * 100)} %
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#C9CFEA]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: SERIE[0] }}
                initial={{ width: 0 }}
                whileInView={{ width: `${pct * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Mapa de calor de actividad por día (semanas en columnas), tipo GitHub. */
export function Heatmap({ dias, semanas = 26, hoy }: { dias: { dia: string; n: number }[]; semanas?: number; hoy: string }) {
  const porDia = new Map(dias.map((d) => [d.dia.slice(0, 10), d.n]));
  const max = Math.max(1, ...dias.map((d) => d.n));
  const fin = new Date(`${hoy}T12:00:00Z`);
  // Empieza en lunes, `semanas` atrás.
  const inicio = new Date(fin);
  inicio.setUTCDate(inicio.getUTCDate() - ((fin.getUTCDay() + 6) % 7) - (semanas - 1) * 7);
  const columnas: { iso: string; n: number; futuro: boolean }[][] = [];
  for (let w = 0; w < semanas; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio);
      f.setUTCDate(inicio.getUTCDate() + w * 7 + d);
      const iso = f.toISOString().slice(0, 10);
      col.push({ iso, n: porDia.get(iso) ?? 0, futuro: f > fin });
    }
    columnas.push(col);
  }
  const nivel = (n: number) => (n === 0 ? 0 : Math.min(SECUENCIAL.length - 1, 1 + Math.floor((n / max) * (SECUENCIAL.length - 2))));

  return (
    <div className="space-y-2">
      <div className="no-scrollbar overflow-x-auto">
        <div className="flex w-max gap-[3px]">
          {columnas.map((col, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {col.map((c) => (
                <motion.span
                  key={c.iso}
                  title={`${fechaCorta(c.iso)}: ${c.n} acciones`}
                  className="block h-3 w-3 rounded-[3px]"
                  style={{ background: c.futuro ? "transparent" : SECUENCIAL[nivel(c.n)] }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: w * 0.015, duration: 0.25 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-[11px] text-text-muted">
        Menos
        {SECUENCIAL.map((c) => (
          <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} aria-hidden="true" />
        ))}
        Más
      </div>
    </div>
  );
}
