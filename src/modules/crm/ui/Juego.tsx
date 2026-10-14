"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";

import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { useFx } from "@/components/fx/FxProvider";
import { ProgressBar } from "@/components/fx/Progress";
import { Icon } from "@/components/ui/Icon";
import { card } from "@/components/ui/styles";
import { nivelDe, type Logro } from "@/modules/crm/gamificacion";

const CLAVE = "impar.juego";

/**
 * Avisa de subidas de nivel y logros nuevos desde la última visita (lo
 * recuerda en el navegador). La primera vez solo guarda, sin fuegos artificiales.
 */
export function useAvisosDeJuego(xp: number, logros: Logro[]) {
  const fx = useFx();
  useEffect(() => {
    let previo: { nivel: string; logros: string[] } | null = null;
    try {
      previo = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null");
    } catch {
      previo = null;
    }
    const nivel = nivelDe(xp).actual;
    const conseguidos = logros.filter((l) => l.conseguido).map((l) => l.id);
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({ nivel: nivel.nombre, logros: conseguidos }));
    } catch {
      return;
    }
    if (!previo) return;
    const nuevos = logros.filter((l) => l.conseguido && !previo!.logros.includes(l.id));
    let retraso = 600;
    if (previo.nivel !== nivel.nombre && nivelDe(xp).actual.desde > 0) {
      window.setTimeout(() => {
        fx.celebrar("nivel");
        fx.avisar({ emoji: nivel.emoji, titulo: `¡Subes a nivel ${nivel.nombre}!`, detalle: `${xp} XP acumulados` });
      }, retraso);
      retraso += 1600;
    }
    for (const l of nuevos.slice(0, 3)) {
      window.setTimeout(() => {
        fx.celebrar("logro");
        fx.avisar({ emoji: l.emoji, titulo: `Logro desbloqueado: ${l.nombre}`, detalle: l.descripcion });
      }, retraso);
      retraso += 1400;
    }
  }, [xp, logros, fx]);
}

export function TarjetaJuego({
  xp,
  racha,
  mejorRacha,
  posicion,
  totalEquipo,
  logros,
}: {
  xp: number;
  racha: number;
  mejorRacha: number;
  posicion: number;
  totalEquipo: number;
  logros: Logro[];
}) {
  useAvisosDeJuego(xp, logros);
  const { actual, siguiente, progreso, faltan } = nivelDe(xp);
  const conseguidos = logros.filter((l) => l.conseguido).length;

  return (
    <section className="overflow-hidden rounded-xl bg-gradient-to-br from-icam-900 via-icam-800 to-icam-900 p-4 text-white shadow-lg sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <motion.span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-4xl ring-2 ring-icam-gold/60"
          initial={{ rotate: -12, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          aria-hidden="true"
        >
          {actual.emoji}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-white/60">Tu nivel</p>
          <p className="text-xl font-semibold">
            {actual.nombre} · <AnimatedNumber value={xp} suffix=" XP" className="text-icam-gold" />
          </p>
          <div className="mt-2 max-w-md">
            <ProgressBar value={progreso} className="h-2.5 bg-white/15" label="Progreso de nivel" />
            <p className="mt-1 text-xs text-white/65">
              {siguiente ? `${faltan} XP para ${siguiente.emoji} ${siguiente.nombre}` : "Nivel máximo. ¡Leyenda de Impar!"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/10 p-3 text-center">
          <p className="flex items-center justify-center gap-1 text-2xl font-bold">
            <span className={racha > 0 ? "animate-flame inline-block" : "inline-block grayscale"} aria-hidden="true">🔥</span>
            <AnimatedNumber value={racha} />
          </p>
          <p className="text-[11px] text-white/65">días de racha · mejor {mejorRacha}</p>
        </div>
        <div className="rounded-lg bg-white/10 p-3 text-center">
          <p className="text-2xl font-bold">
            #<AnimatedNumber value={posicion} />
          </p>
          <p className="text-[11px] text-white/65">de {totalEquipo} · últimos 7 días</p>
        </div>
        <Link href="/analiticas" className="rounded-lg bg-white/10 p-3 text-center transition hover:bg-white/20">
          <p className="text-2xl font-bold">
            🏆 <AnimatedNumber value={conseguidos} />
          </p>
          <p className="text-[11px] text-white/65">de {logros.length} logros →</p>
        </Link>
      </div>
    </section>
  );
}

export function VitrinaLogros({ logros }: { logros: Logro[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {logros.map((l, i) => (
        <motion.li
          key={l.id}
          initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: i * 0.05 }}
          whileHover={{ y: -4, rotate: l.conseguido ? 3 : 0 }}
          className={`${card} flex flex-col items-center p-2 text-center ${l.conseguido ? "border-icam-gold/50 bg-gradient-to-b from-icam-gold/10 to-card" : ""}`}
          title={l.descripcion}
        >
          <span className={`text-3xl ${l.conseguido ? "" : "opacity-30 grayscale"}`} aria-hidden="true">{l.emoji}</span>
          <span className={`mt-1 text-[11px] font-semibold leading-tight ${l.conseguido ? "text-text-primary" : "text-text-muted"}`}>{l.nombre}</span>
          {l.conseguido ? (
            <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
              <Icon name="check" className="h-3 w-3" /> Conseguido
            </span>
          ) : (
            <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full bg-icam-gold" style={{ width: `${l.progreso * 100}%` }} />
            </span>
          )}
          <span className="sr-only">{l.descripcion}</span>
        </motion.li>
      ))}
    </ul>
  );
}
