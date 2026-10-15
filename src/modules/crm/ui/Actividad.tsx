"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";

import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { useFx } from "@/components/fx/FxProvider";
import { Icon } from "@/components/ui/Icon";
import { card } from "@/components/ui/styles";
import type { Objetivo } from "@/modules/crm/gamificacion";

const CLAVE = "impar.objetivos";

/**
 * Avisa de objetivos cumplidos desde la última visita (lo recuerda en el
 * navegador). La primera vez solo guarda, sin avisos.
 */
function useAvisosDeObjetivos(objetivos: Objetivo[]) {
  const fx = useFx();
  useEffect(() => {
    let previos: string[] | null = null;
    try {
      previos = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null");
    } catch {
      previos = null;
    }
    const conseguidos = objetivos.filter((o) => o.conseguido).map((o) => o.id);
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(conseguidos));
    } catch {
      return;
    }
    if (!Array.isArray(previos)) return;
    objetivos
      .filter((o) => o.conseguido && !previos!.includes(o.id))
      .slice(0, 3)
      .forEach((o, i) => {
        window.setTimeout(() => fx.avisar({ icon: o.icon, titulo: `Objetivo cumplido: ${o.nombre}`, detalle: o.descripcion }), 600 + i * 1400);
      });
  }, [objetivos, fx]);
}

/** Franja de resumen: racha, posición semanal y objetivos. */
export function ResumenActividad({
  racha,
  mejorRacha,
  posicion,
  totalEquipo,
  objetivos,
}: {
  racha: number;
  mejorRacha: number;
  posicion: number;
  totalEquipo: number;
  objetivos: Objetivo[];
}) {
  useAvisosDeObjetivos(objetivos);
  const conseguidos = objetivos.filter((o) => o.conseguido).length;

  const celdas = [
    {
      icon: "fire" as const,
      valor: racha,
      titulo: racha === 1 ? "día de racha" : "días de racha",
      sub: `Mejor racha: ${mejorRacha}`,
      vivo: racha > 0,
    },
    {
      icon: "chart" as const,
      valor: posicion,
      prefijo: "#",
      titulo: "en actividad",
      sub: `de ${totalEquipo} · últimos 7 días`,
    },
    {
      icon: "check" as const,
      valor: conseguidos,
      titulo: `de ${objetivos.length} objetivos`,
      sub: "Ver objetivos",
      href: "/analiticas",
    },
  ];

  return (
    <section className="grid grid-cols-3 overflow-hidden rounded-lg bg-icam-900 text-white shadow-sm">
      {celdas.map((c, i) => {
        const contenido = (
          <>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${c.vivo ? "bg-icam-gold text-white" : "bg-white/10 text-icam-gold"}`}>
              <Icon name={c.icon} className={`h-[18px] w-[18px] ${c.vivo ? "animate-flame" : ""}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold leading-tight sm:text-2xl">
                <AnimatedNumber value={c.valor} prefix={c.prefijo} />
                <span className="ml-1 text-xs font-normal text-white/70 sm:text-sm">{c.titulo}</span>
              </span>
              <span className="block truncate text-[11px] text-white/55">{c.sub}</span>
            </span>
          </>
        );
        const clases = `flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4 ${i > 0 ? "border-l border-white/10" : ""}`;
        return c.href ? (
          <Link key={c.titulo} href={c.href} className={`${clases} transition hover:bg-white/5`}>
            {contenido}
          </Link>
        ) : (
          <div key={c.titulo} className={clases}>
            {contenido}
          </div>
        );
      })}
    </section>
  );
}

export function ListaObjetivos({ objetivos }: { objetivos: Objetivo[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {objetivos.map((o, i) => (
        <motion.li
          key={o.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
          className={`${card} flex items-center gap-3 p-3`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              o.conseguido ? "bg-icam-gold text-white" : "bg-subtle text-text-muted"
            }`}
          >
            <Icon name={o.conseguido ? "check" : o.icon} className="h-4 w-4" strokeWidth={o.conseguido ? 2.4 : 1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-sm font-medium ${o.conseguido ? "text-text-primary" : "text-text-body"}`}>{o.nombre}</span>
              <span className="shrink-0 text-xs tabular-nums text-text-muted">
                {o.valor}/{o.meta}
              </span>
            </span>
            <span className="block truncate text-xs text-text-muted">{o.descripcion}</span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-subtle">
              <motion.span
                className={`block h-full rounded-full ${o.conseguido ? "bg-icam-gold" : "bg-icam-900/60"}`}
                initial={{ width: 0 }}
                animate={{ width: `${o.progreso * 100}%` }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
