"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { AreaTrend, BarRanking, ColumnasDobles, DonutChart, Funnel, Heatmap } from "@/components/charts/Charts";
import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { Reveal } from "@/components/fx/Reveal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/PageHeader";
import { card } from "@/components/ui/styles";
import type { StatsEmpleado, StatsEquipo } from "@/modules/crm/data";
import type { Objetivo } from "@/modules/crm/gamificacion";
import { ListaObjetivos, ResumenActividad } from "@/modules/crm/ui/Actividad";

export const RANGOS = [7, 30, 90] as const;

function Segmentos<T extends string | number>({
  opciones,
  actual,
  href,
  id,
}: {
  opciones: { valor: T; label: string }[];
  actual: T;
  href: (v: T) => string;
  id: string;
}) {
  return (
    <div className="inline-flex rounded-lg bg-subtle/70 p-1">
      {opciones.map((o) => (
        <Link
          key={String(o.valor)}
          href={href(o.valor)}
          scroll={false}
          aria-current={o.valor === actual ? "page" : undefined}
          className={`relative min-h-9 rounded-md px-3 py-1.5 text-sm font-medium ${o.valor === actual ? "text-icam-900" : "text-text-muted hover:text-text-primary"}`}
        >
          {o.valor === actual ? <motion.span layoutId={id} className="absolute inset-0 rounded-md bg-card shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 35 }} /> : null}
          <span className="relative">{o.label}</span>
        </Link>
      ))}
    </div>
  );
}

function Kpi({ titulo, valor, sub, icon, i }: { titulo: string; valor: number; sub: string; icon: IconName; i: number }) {
  return (
    <Reveal index={i} className={`${card} fx-lift p-4`}>
      <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-text-muted">
        {titulo} <Icon name={icon} className="h-4 w-4 text-icam-gold" />
      </p>
      <p className="mt-1 text-3xl font-semibold text-text-primary">
        <AnimatedNumber value={valor} />
      </p>
      <p className="text-xs text-text-muted">{sub}</p>
    </Reveal>
  );
}

export function Analiticas({
  rango,
  vista,
  esAdmin,
  stats,
  equipo,
  hoy,
  resumen,
  userId,
}: {
  rango: number;
  vista: "yo" | "equipo";
  esAdmin: boolean;
  stats: StatsEmpleado;
  equipo: StatsEquipo | null;
  hoy: string;
  resumen: { racha: number; mejorRacha: number; posicion: number; totalEquipo: number; objetivos: Objetivo[] };
  userId: string;
}) {
  const href = (r: number, v: string = vista) => `/analiticas?rango=${r}${v === "equipo" ? "&vista=equipo" : ""}`;
  const suma = (k: "contactados" | "clasificados" | "incluidos") => stats.serie.reduce((s, d) => s + Number(d[k]), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {esAdmin ? (
          <Segmentos
            id="vista"
            actual={vista}
            href={(v) => href(rango, v)}
            opciones={[
              { valor: "yo", label: "Mi actividad" },
              { valor: "equipo", label: "Equipo" },
            ]}
          />
        ) : (
          <span />
        )}
        <Segmentos id="rango" actual={rango} href={(r) => href(r)} opciones={RANGOS.map((r) => ({ valor: r, label: `${r} días` }))} />
      </div>

      {vista === "equipo" && equipo ? (
        <VistaEquipo equipo={equipo} rango={rango} userId={userId} />
      ) : (
        <>
          <ResumenActividad {...resumen} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi i={0} titulo="Contactados" valor={suma("contactados")} sub={`en hitos · ${rango} días`} icon="check" />
            <Kpi i={1} titulo="Clasificados" valor={suma("clasificados")} sub={`en el ritual · ${rango} días`} icon="cards" />
            <Kpi i={2} titulo="Invitados" valor={suma("incluidos")} sub={`a hitos · ${rango} días`} icon="mail" />
            <Kpi i={3} titulo="Récord diario" valor={stats.totales.max_contactos_dia} sub="contactos en un día" icon="fire" />
          </div>

          <section className={`${card} p-4`}>
            <SectionTitle>Tu actividad día a día</SectionTitle>
            <AreaTrend
              data={stats.serie}
              xKey="dia"
              series={[
                { key: "contactados", label: "Contactados en hitos" },
                { key: "clasificados", label: "Clasificados en el ritual" },
              ]}
              height={240}
            />
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className={`${card} p-4`}>
              <SectionTitle>Por qué canal contactas</SectionTitle>
              <DonutChart data={stats.canales.map((c) => ({ name: c.canal, value: Number(c.n) }))} centro="contactos" />
            </section>
            <section className={`${card} p-4`}>
              <SectionTitle>Tus hitos · invitados → contactados</SectionTitle>
              <Funnel items={stats.hitos.slice(0, 6).map((h) => ({ ...h, incluidos: Number(h.incluidos), contactados: Number(h.contactados) }))} />
            </section>
          </div>

          <section className={`${card} p-4`}>
            <SectionTitle>Mapa de constancia · últimos 6 meses</SectionTitle>
            <Heatmap dias={stats.dias_activos} hoy={hoy} />
          </section>

          <section>
            <SectionTitle>Objetivos</SectionTitle>
            <ListaObjetivos objetivos={resumen.objetivos} />
          </section>
        </>
      )}
    </div>
  );
}

function VistaEquipo({ equipo, rango, userId }: { equipo: StatsEquipo; rango: number; userId: string }) {
  const tot = equipo.ranking.reduce(
    (a, r) => ({ c: a.c + Number(r.contactados), k: a.k + Number(r.clasificados), i: a.i + Number(r.incluidos) }),
    { c: 0, k: 0, i: 0 },
  );
  const activos = equipo.ranking.filter((r) => Number(r.xp) > 0).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi i={0} titulo="Contactados" valor={tot.c} sub={`equipo · ${rango} días`} icon="check" />
        <Kpi i={1} titulo="Clasificados" valor={tot.k} sub={`equipo · ${rango} días`} icon="cards" />
        <Kpi i={2} titulo="Invitados" valor={tot.i} sub={`equipo · ${rango} días`} icon="mail" />
        <Kpi i={3} titulo="Empleados activos" valor={activos} sub={`de ${equipo.ranking.length} empleados`} icon="users" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={`${card} p-4`}>
          <SectionTitle>Actividad del periodo · contactos + clasificados</SectionTitle>
          <BarRanking
            unidad="acciones"
            destacar={userId}
            items={equipo.ranking.map((r) => ({
              id: r.id,
              nombre: r.nombre,
              valor: Number(r.xp),
              detalle: `${r.contactados} contactados · ${r.clasificados} clasificados · ${r.incluidos} invitados`,
            }))}
          />
        </section>
        <section className={`${card} p-4`}>
          <SectionTitle>Semana a semana</SectionTitle>
          <ColumnasDobles
            data={equipo.semanal.map((s) => ({ ...s, contactados: Number(s.contactados), clasificados: Number(s.clasificados) }))}
            xKey="semana"
            series={[
              { key: "contactados", label: "Contactados" },
              { key: "clasificados", label: "Clasificados" },
            ]}
            height={260}
          />
        </section>
      </div>

      <section className={`${card} p-4`}>
        <SectionTitle>Hitos generales · avance del equipo</SectionTitle>
        <Funnel items={equipo.hitos.map((h) => ({ ...h, incluidos: Number(h.incluidos), contactados: Number(h.contactados) }))} />
      </section>
    </>
  );
}
