"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";

import { Columnas, DonutChart } from "@/components/charts/Charts";
import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { Avatar } from "@/components/fx/AvatarStack";
import { useFx } from "@/components/fx/FxProvider";
import { Reveal } from "@/components/fx/Reveal";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { fmtFecha } from "@/lib/format";
import { adoptarRelacion } from "@/modules/crm/actions";
import type { StatsBolsa } from "@/modules/crm/data";
import { TRAMOS_ANTIGUEDAD, tramoAntiguedad } from "@/modules/crm/gamificacion";

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

const TONO_TRAMO: Record<string, string> = {
  "< 3 meses": "bg-emerald-50 text-emerald-700",
  "3-6 meses": "bg-icam-gold/15 text-[#7d6235]",
  "6-12 meses": "bg-orange-50 text-orange-700",
  "> 12 meses": "bg-red-50 text-red-700",
  "Sin reunión": "bg-subtle text-text-muted",
};

export function BolsaComun({ items, stats, hoy }: { items: BolsaItem[]; stats: StatsBolsa; hoy: string }) {
  const router = useRouter();
  const fx = useFx();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [dueno, setDueno] = useState<string | null>(null);
  const [tramo, setTramo] = useState<string | null>(null);
  const [lista, quitar] = useOptimistic(items, (l: BolsaItem[], id: string) => l.filter((i) => i.relacion_id !== id));
  const [rescates, setRescates] = useState(stats.mis_rescates);

  const porDueno = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of lista) m.set(i.empleado_nombre, (m.get(i.empleado_nombre) ?? 0) + 1);
    return [...m].map(([name, value]) => ({ name, value }));
  }, [lista]);

  const porTramo = useMemo(
    () => TRAMOS_ANTIGUEDAD.map((t) => ({ tramo: t, n: lista.filter((i) => tramoAntiguedad(i.ultima_reunion, hoy) === t).length })),
    [lista, hoy],
  );

  const visibles = lista.filter(
    (i) => (!dueno || i.empleado_nombre === dueno) && (!tramo || tramoAntiguedad(i.ultima_reunion, hoy) === tramo),
  );

  function adoptar(i: BolsaItem, el: Element | null) {
    setError("");
    fx.celebrar("contacto", el);
    fx.flotar("¡Rescatado! 🛟", el);
    startTransition(async () => {
      quitar(i.relacion_id);
      const res = await adoptarRelacion(i.relacion_id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo adoptar");
        return;
      }
      const n = rescates + 1;
      setRescates(n);
      if (n === 5) {
        fx.celebrar("logro");
        fx.avisar({ emoji: "🛟", titulo: "Logro desbloqueado: Rescatador", detalle: "Has adoptado 5 contactos de la bolsa" });
      }
      router.refresh();
    });
  }

  const kpis = [
    { t: "En la bolsa", n: lista.length, sub: "contactos esperando dueño", emoji: "📦" },
    { t: "Adoptados este mes", n: stats.adoptados_mes + (rescates - stats.mis_rescates), sub: "por todo el equipo", emoji: "🤝" },
    { t: "Tus rescates", n: rescates, sub: rescates >= 5 ? "¡Rescatador!" : `${5 - rescates} para el logro 🛟`, emoji: "🛟" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k, i) => (
          <Reveal key={k.t} index={i} className={`${card} fx-lift flex items-center gap-3 p-4`}>
            <span className="text-3xl" aria-hidden="true">{k.emoji}</span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-text-muted">{k.t}</span>
              <span className="block text-2xl font-semibold text-text-primary">
                <AnimatedNumber value={k.n} />
              </span>
              <span className="block text-xs text-text-muted">{k.sub}</span>
            </span>
          </Reveal>
        ))}
      </div>

      {lista.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <section className={`${card} p-4`}>
            <SectionTitle>Por antiguo dueño</SectionTitle>
            <DonutChart data={porDueno} centro="contactos" height={160} />
          </section>
          <section className={`${card} p-4`}>
            <SectionTitle>Riesgo de enfriarse · última reunión</SectionTitle>
            <Columnas data={porTramo} xKey="tramo" yKey="n" label="Contactos" height={190} />
          </section>
          <section className={`${card} p-4`}>
            <SectionTitle>Adopciones por semana</SectionTitle>
            <Columnas data={stats.adopciones} xKey="semana" yKey="n" label="Adopciones" height={190} fecha />
          </section>
        </div>
      ) : null}

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {lista.length === 0 ? (
        <EmptyState title="La bolsa común está vacía">Cuando un empleado cause baja, sus contactos aparecerán aquí.</EmptyState>
      ) : (
        <section>
          <div className="no-scrollbar -mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
            <Chip activo={!dueno && !tramo} onClick={() => (setDueno(null), setTramo(null))}>
              Todos <span className="opacity-70">{lista.length}</span>
            </Chip>
            {porDueno.map((d) => (
              <Chip key={d.name} activo={dueno === d.name} onClick={() => setDueno(dueno === d.name ? null : d.name)}>
                de {d.name} <span className="opacity-70">{d.value}</span>
              </Chip>
            ))}
            {porTramo
              .filter((t) => t.n > 0)
              .map((t) => (
                <Chip key={t.tramo} activo={tramo === t.tramo} onClick={() => setTramo(tramo === t.tramo ? null : t.tramo)}>
                  {t.tramo} <span className="opacity-70">{t.n}</span>
                </Chip>
              ))}
          </div>

          <motion.ul layout className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {visibles.map((i) => {
                const t = tramoAntiguedad(i.ultima_reunion, hoy);
                return (
                  <motion.li
                    key={i.relacion_id}
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: 120, y: -40, rotate: 8, scale: 0.7, transition: { duration: 0.35 } }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className={`${card} fx-lift flex flex-col gap-3 p-3`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar nombre={i.persona_nombre} size="h-10 w-10 text-xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-text-primary">{i.persona_nombre}</span>
                        <span className="block truncate text-xs text-text-muted">{[i.empresa, i.persona_email].filter(Boolean).join(" · ") || "—"}</span>
                        <span className="mt-1 block text-xs text-text-muted">
                          de {i.empleado_nombre} · última reunión {fmtFecha(i.ultima_reunion)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONO_TRAMO[t]}`}>{t}</span>
                      <button
                        type="button"
                        className={`${btn.gold} min-h-10`}
                        disabled={pending}
                        onClick={(e) => adoptar(i, e.currentTarget)}
                      >
                        🛟 Adoptar
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
          {visibles.length === 0 ? <p className="py-6 text-center text-sm text-text-muted">Nada con estos filtros.</p> : null}
        </section>
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-pressed={activo}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
        activo ? "border-icam-900 bg-icam-900 text-white" : "border-subtle bg-card text-text-primary hover:border-icam-900"
      }`}
    >
      {children}
    </motion.button>
  );
}
