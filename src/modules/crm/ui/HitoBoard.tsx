"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { AreaTrend } from "@/components/charts/Charts";
import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { Avatar } from "@/components/fx/AvatarStack";
import { useFx } from "@/components/fx/FxProvider";
import { ProgressRing } from "@/components/fx/Progress";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { btn, card } from "@/components/ui/styles";
import { fmtFechaCorta } from "@/lib/format";
import {
  eliminarHito,
  incluirEnHito,
  marcarContactado,
  quitarDeHito,
  reintentarZoho,
  volverAPendiente,
} from "@/modules/crm/actions";
import { CANALES, type HitoPersona, type Persona } from "@/modules/crm/types";

export type Miembro = HitoPersona & { contactadoPorNombre: string | null };

type Columna = "candidato" | "pte" | "contactado";

interface Tarjeta {
  persona: Persona;
  col: Columna;
  miembro?: Miembro;
}

type Movimiento =
  | { tipo: "mover"; personaIds: string[]; a: Columna; canal?: string }
  | { tipo: "quitar"; personaId: string };

const COLUMNAS: { id: Columna; titulo: string; vacio: string; tono: string }[] = [
  { id: "candidato", titulo: "Candidatos", vacio: "Sin más candidatos con estas etiquetas", tono: "bg-subtle text-text-muted" },
  { id: "pte", titulo: "Pendientes", vacio: "Arrastra aquí candidatos para invitarlos", tono: "bg-icam-gold/15 text-[#7d6235]" },
  { id: "contactado", titulo: "Contactados", vacio: "Arrastra aquí a quien ya hayas contactado", tono: "bg-emerald-50 text-emerald-700" },
];

const CANAL_KEY = "impar.canal";

function aplicar(tarjetas: Tarjeta[], m: Movimiento): Tarjeta[] {
  if (m.tipo === "quitar") {
    return tarjetas.map((t) => (t.persona.id === m.personaId ? { ...t, col: "candidato", miembro: undefined } : t));
  }
  const ids = new Set(m.personaIds);
  return tarjetas.map((t) =>
    ids.has(t.persona.id)
      ? {
          ...t,
          col: m.a,
          miembro: t.miembro
            ? { ...t.miembro, estado: m.a === "contactado" ? "contactado" : "pte", canal: m.canal ?? null, contactadoPorNombre: m.a === "contactado" ? "ti" : null, fecha_contacto: m.a === "contactado" ? new Date().toISOString() : null, zoho_estado: null }
            : undefined,
        }
      : t,
  );
}

export function HitoBoard({
  hitoId,
  miembros,
  candidatos,
  puedeEliminar,
  serie,
}: {
  hitoId: string;
  miembros: Miembro[];
  candidatos: Persona[];
  puedeEliminar: boolean;
  serie: { dia: string; contactados: number }[];
}) {
  const router = useRouter();
  const fx = useFx();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sacudir, setSacudir] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<Tarjeta | null>(null);
  const [pidiendoCanal, setPidiendoCanal] = useState<string | null>(null);
  const [tab, setTab] = useState<Columna>(miembros.length === 0 ? "candidato" : "pte");
  const [canalDefecto, setCanalDefecto] = useState<string>(CANALES[0]);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const c = window.localStorage.getItem(CANAL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia local leída tras montar
      if (c && (CANALES as readonly string[]).includes(c)) setCanalDefecto(c);
    } catch {
      /* sin almacenamiento: canal por defecto */
    }
  }, []);

  const base: Tarjeta[] = [
    ...miembros.map((m) => ({ persona: m.persona, col: (m.estado === "contactado" ? "contactado" : "pte") as Columna, miembro: m })),
    ...candidatos.map((p) => ({ persona: p, col: "candidato" as Columna })),
  ];
  const [tarjetas, mover] = useOptimistic(base, aplicar);

  const por = (c: Columna) => tarjetas.filter((t) => t.col === c).sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre));
  const invitados = tarjetas.filter((t) => t.col !== "candidato").length;
  const contactados = por("contactado").length;
  const pct = invitados ? contactados / invitados : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function ejecutar(m: Movimiento | null, accion: () => Promise<{ ok: boolean; error?: string }>, efecto?: () => void) {
    setError("");
    efecto?.();
    startTransition(async () => {
      if (m) mover(m);
      const res = await accion();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        if (m) setSacudir(m.tipo === "quitar" ? m.personaId : m.personaIds[0]);
        window.setTimeout(() => setSacudir(null), 600);
      } else {
        router.refresh();
      }
    });
  }

  function celebrarContacto(personaId: string, nuevoInvitado: boolean) {
    const el = document.querySelector(`[data-card="${personaId}"]`) ?? ringRef.current;
    fx.celebrar("contacto", el);
    fx.flotar("+1 ⭐", el);
    ringRef.current?.classList.remove("animate-pulse-gold");
    void ringRef.current?.offsetWidth;
    ringRef.current?.classList.add("animate-pulse-gold");
    const total = invitados + (nuevoInvitado ? 1 : 0);
    if (contactados + 1 === total) {
      window.setTimeout(() => {
        fx.celebrar("hito");
        fx.avisar({ emoji: "🏁", titulo: "¡Hito completado!", detalle: `Has contactado a tus ${total} invitados` });
      }, 450);
    }
  }

  function incluir(ids: string[]) {
    if (ids.length === 0) return;
    ejecutar({ tipo: "mover", personaIds: ids, a: "pte" }, () => incluirEnHito(hitoId, ids), () => {
      fx.flotar(ids.length > 1 ? `+${ids.length} invitados` : "¡Invitado!", document.querySelector(`[data-card="${ids[0]}"]`));
    });
  }

  function contactar(personaId: string, canal: string) {
    setCanalDefecto(canal);
    try {
      window.localStorage.setItem(CANAL_KEY, canal);
    } catch {
      /* ignorado */
    }
    // Desde Candidatos se invita y se marca en el mismo gesto.
    const esCandidato = tarjetas.find((t) => t.persona.id === personaId)?.col === "candidato";
    ejecutar(
      { tipo: "mover", personaIds: [personaId], a: "contactado", canal },
      async () => {
        if (esCandidato) {
          const r = await incluirEnHito(hitoId, [personaId]);
          if (!r.ok) return r;
        }
        return marcarContactado(hitoId, personaId, canal);
      },
      () => celebrarContacto(personaId, esCandidato),
    );
  }

  function aPendiente(personaId: string) {
    ejecutar({ tipo: "mover", personaIds: [personaId], a: "pte" }, () => volverAPendiente(hitoId, personaId));
  }

  function quitar(personaId: string) {
    ejecutar({ tipo: "quitar", personaId }, () => quitarDeHito(hitoId, personaId));
  }

  function moverA(t: Tarjeta, destino: Columna | "quitar") {
    if (destino === t.col) return;
    if (destino === "quitar") return t.col === "pte" ? quitar(t.persona.id) : undefined;
    if (t.col === "candidato" && destino === "pte") return incluir([t.persona.id]);
    if (destino === "contactado") return setPidiendoCanal(t.persona.id);
    if (t.col === "contactado" && destino === "pte") return aPendiente(t.persona.id);
    if (t.col === "pte" && destino === "candidato") return quitar(t.persona.id);
  }

  function onDragStart(e: DragStartEvent) {
    setArrastrando(tarjetas.find((t) => t.persona.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    const t = tarjetas.find((x) => x.persona.id === e.active.id);
    const destino = e.over?.data.current?.col as Columna | "quitar" | undefined;
    if (t && destino) moverA(t, destino);
  }

  const personaCanal = tarjetas.find((t) => t.persona.id === pidiendoCanal);

  return (
    <div className="space-y-5">
      {/* Marcador del hito */}
      <div className={`${card} flex items-center gap-4 p-4`}>
        <div ref={ringRef} className="rounded-full">
          <ProgressRing value={pct} size={84} stroke={9} color={pct === 1 ? "#3E9A55" : "#B89660"} label={`${Math.round(pct * 100)} % contactado`}>
            <span>
              <span className="block text-lg font-bold leading-none text-text-primary">
                <AnimatedNumber value={Math.round(pct * 100)} suffix="%" />
              </span>
              <span className="text-[10px] uppercase tracking-wide text-text-muted">hecho</span>
            </span>
          </ProgressRing>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          {[
            { n: invitados, t: "Invitados", col: "pte" as const },
            { n: por("pte").length, t: "Pendientes", col: "pte" as const },
            { n: contactados, t: "Contactados", col: "contactado" as const },
          ].map((k) => (
            <div key={k.t} data-contador={k.col}>
              <p className="text-2xl font-semibold text-text-primary">
                <AnimatedNumber value={k.n} />
              </p>
              <p className="text-xs text-text-muted">{k.t}</p>
            </div>
          ))}
        </div>
      </div>

      {serie.some((s) => s.contactados > 0) ? (
        <div className={`${card} p-4`}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Contactos por día en este hito</p>
          <AreaTrend data={serie} xKey="dia" series={[{ key: "contactados", label: "Contactados" }]} height={140} />
        </div>
      ) : null}

      <AnimatePresence>
        {error ? (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setArrastrando(null)}>
        {/* Móvil y tablet: pestañas (que también aceptan soltar) */}
        <div className="lg:hidden">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-subtle/70 p-1">
            {COLUMNAS.map((c) => (
              <TabDroppable key={c.id} col={c.id} activa={tab === c.id} onClick={() => setTab(c.id)} n={por(c.id).length} titulo={c.titulo} />
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-text-muted">Mantén pulsada una tarjeta y suéltala en otra pestaña</p>
        </div>

        <LayoutGroup>
          <div className="grid gap-3 lg:grid-cols-3">
            {COLUMNAS.map((c) => (
              <ColumnaDroppable
                key={c.id}
                def={c}
                visibleMovil={tab === c.id}
                n={por(c.id).length}
                aside={
                  c.id === "candidato" && por("candidato").length > 1 ? (
                    <button type="button" className="text-xs font-medium text-icam-900 underline" disabled={pending} onClick={() => incluir(por("candidato").map((t) => t.persona.id))}>
                      Invitar a todos
                    </button>
                  ) : null
                }
              >
                <AnimatePresence initial={false}>
                  {por(c.id).map((t) => (
                    <TarjetaDraggable
                      key={t.persona.id}
                      t={t}
                      sacudir={sacudir === t.persona.id}
                      oculta={arrastrando?.persona.id === t.persona.id}
                      pending={pending}
                      onInvitar={() => incluir([t.persona.id])}
                      onContactar={() => setPidiendoCanal(t.persona.id)}
                      onPendiente={() => aPendiente(t.persona.id)}
                      onQuitar={() => quitar(t.persona.id)}
                      onZoho={() =>
                        ejecutar(null, () => reintentarZoho(hitoId, t.persona.id))
                      }
                    />
                  ))}
                </AnimatePresence>
              </ColumnaDroppable>
            ))}
          </div>
        </LayoutGroup>

        <ZonaQuitar visible={arrastrando?.col === "pte"} />

        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {arrastrando ? (
            <div className={`${card} rotate-2 scale-105 cursor-grabbing p-3 shadow-2xl ring-2 ring-icam-gold`}>
              <CabeceraTarjeta t={arrastrando} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal
        open={!!pidiendoCanal}
        title="¿Por qué canal le has contactado?"
        subtitle={personaCanal?.persona.nombre}
        width="md"
        elevated
        onClose={() => setPidiendoCanal(null)}
      >
        <div className="grid grid-cols-2 gap-2">
          {CANALES.map((c) => (
            <button
              key={c}
              type="button"
              className={`${c === canalDefecto ? btn.primary : btn.secondary} min-h-12`}
              onClick={() => {
                const id = pidiendoCanal!;
                setPidiendoCanal(null);
                contactar(id, c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </Modal>

      {puedeEliminar ? (
        <div className="border-t border-subtle pt-4">
          <button
            type="button"
            className={btn.danger}
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Eliminar este hito y su lista de invitados?")) {
                startTransition(async () => {
                  const res = await eliminarHito(hitoId);
                  if (!res.ok) setError(res.error ?? "Error");
                  else router.push("/hitos");
                });
              }
            }}
          >
            Eliminar hito
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TabDroppable({ col, activa, onClick, n, titulo }: { col: Columna; activa: boolean; onClick: () => void; n: number; titulo: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${col}`, data: { col } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`relative min-h-11 rounded-md text-sm font-medium transition ${isOver ? "scale-105 bg-icam-gold text-white" : activa ? "text-icam-900" : "text-text-muted"}`}
    >
      {activa && !isOver ? <motion.span layoutId="hito-tab" className="absolute inset-0 rounded-md bg-card shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 35 }} /> : null}
      <span className="relative">
        {titulo} <span className="tabular-nums text-xs opacity-70">{n}</span>
      </span>
    </button>
  );
}

function ColumnaDroppable({
  def,
  n,
  visibleMovil,
  aside,
  children,
}: {
  def: (typeof COLUMNAS)[number];
  n: number;
  visibleMovil: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${def.id}`, data: { col: def.id } });
  return (
    <section
      ref={setNodeRef}
      className={`${visibleMovil ? "block" : "hidden"} rounded-xl border-2 p-2 transition-colors lg:block ${
        isOver ? "border-icam-gold bg-icam-gold/10" : "border-transparent bg-subtle/40"
      }`}
      aria-label={def.titulo}
    >
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {def.titulo}
          <motion.span key={n} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${def.tono}`}>
            {n}
          </motion.span>
        </h3>
        {aside}
      </header>
      <ul className="min-h-24 space-y-2">
        {children}
        {n === 0 ? <li className="rounded-lg border border-dashed border-subtle px-3 py-6 text-center text-xs text-text-muted">{def.vacio}</li> : null}
      </ul>
    </section>
  );
}

function ZonaQuitar({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "quitar", data: { col: "quitar" }, disabled: !visible });
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          ref={setNodeRef}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className={`fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-medium shadow-lg lg:bottom-8 ${
            isOver ? "border-red-500 bg-red-500 text-white" : "border-red-300 bg-card text-red-700"
          }`}
        >
          <Icon name="x" className="h-4 w-4" /> Suelta aquí para quitar del hito
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CabeceraTarjeta({ t }: { t: Tarjeta }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar nombre={t.persona.nombre} size="h-9 w-9 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{t.persona.nombre}</span>
        <span className="block truncate text-xs text-text-muted">
          {[t.persona.cargo, t.persona.empresa?.nombre].filter(Boolean).join(" · ") || t.persona.email || t.persona.telefono}
        </span>
      </span>
    </div>
  );
}

function TarjetaDraggable({
  t,
  sacudir,
  oculta,
  pending,
  onInvitar,
  onContactar,
  onPendiente,
  onQuitar,
  onZoho,
}: {
  t: Tarjeta;
  sacudir: boolean;
  oculta: boolean;
  pending: boolean;
  onInvitar: () => void;
  onContactar: () => void;
  onPendiente: () => void;
  onQuitar: () => void;
  onZoho: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: t.persona.id });
  const m = t.miembro;

  return (
    <motion.li
      layout
      layoutId={`tarjeta-${t.persona.id}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: oculta ? 0.35 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      data-card={t.persona.id}
      className={`${card} fx-lift p-3 ${sacudir ? "animate-shake ring-2 ring-red-300" : ""} ${t.col === "contactado" ? "border-l-4 border-l-emerald-500" : t.col === "pte" ? "border-l-4 border-l-icam-gold" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          ref={setNodeRef}
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Arrastrar a ${t.persona.nombre}`}
          className="-ml-1 flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-text-muted/60 hover:text-text-primary active:cursor-grabbing"
        >
          <Icon name="grip" className="h-4 w-4" strokeWidth={3} />
        </button>
        <Link href={`/contactos/${t.persona.id}`} className="min-w-0 flex-1 hover:underline">
          <CabeceraTarjeta t={t} />
        </Link>
      </div>

      {t.col === "candidato" ? (
        <div className="mt-2 flex justify-end">
          <button type="button" className={`${btn.secondary} min-h-9 px-3`} disabled={pending} onClick={onInvitar}>
            <Icon name="plus" className="h-4 w-4" /> Invitar
          </button>
        </div>
      ) : null}

      {t.col === "pte" ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" aria-label="Quitar del hito" className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-page" disabled={pending} onClick={onQuitar}>
            <Icon name="x" className="h-4 w-4" />
          </button>
          <button type="button" className={`${btn.primary} min-h-9 px-3`} disabled={pending} onClick={onContactar}>
            <Icon name="check" className="h-4 w-4" /> Contactado
          </button>
        </div>
      ) : null}

      {t.col === "contactado" && m ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-text-muted">
            ✅ {m.contactadoPorNombre ?? "—"}, {fmtFechaCorta(m.fecha_contacto)}
            {m.canal ? ` · ${m.canal}` : ""}
            {m.zoho_estado === "ok" ? " · En Zoho" : ""}
          </p>
          {m.zoho_estado === "error" ? (
            <span className="flex items-center justify-between gap-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
              <span className="truncate" title={m.zoho_error ?? undefined}>No se pudo pasar a Zoho</span>
              <button type="button" className="min-h-8 shrink-0 font-medium underline" disabled={pending} onClick={onZoho}>
                Reintentar
              </button>
            </span>
          ) : null}
          <div className="flex justify-end">
            <button type="button" className="min-h-8 text-xs font-medium text-text-muted underline" disabled={pending} onClick={onPendiente}>
              Volver a Pte
            </button>
          </div>
        </div>
      ) : null}
    </motion.li>
  );
}
