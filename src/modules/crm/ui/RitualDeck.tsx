"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { fmtFecha } from "@/lib/format";
import { cambiarEstado, clasificar, crearEtiqueta, deshacer } from "@/modules/crm/actions";
import type { Etiqueta, Relacion } from "@/modules/crm/types";
import { Avatar } from "@/modules/crm/ui/ContactList";
import { TagPicker } from "@/modules/crm/ui/TagPicker";

const UMBRAL_SWIPE = 110;

interface Hecho {
  relacion: Relacion;
  accion: "clasificar" | "archivar";
  añadidas: string[];
}

const PERIODOS = [
  { key: "semana", label: "Semanal" },
  { key: "mes", label: "Mensual" },
  { key: "todo", label: "Todo" },
] as const;

export function RitualDeck({
  cola: colaInicial,
  etiquetas,
  periodo,
  totalPendientes,
  puntosIniciales,
  porBono,
}: {
  cola: Relacion[];
  etiquetas: Etiqueta[];
  periodo: "semana" | "mes" | "todo";
  totalPendientes: number;
  puntosIniciales: number;
  porBono: number;
}) {
  const router = useRouter();
  // La cola se congela al empezar: cada acción revalida la página y la cola del
  // servidor ya no traería las tarjetas hechas, lo que descuadraría el índice.
  const [cola] = useState(colaInicial);
  const [indice, setIndice] = useState(0);
  const [historial, setHistorial] = useState<Hecho[]>([]);
  const [puntos, setPuntos] = useState(puntosIniciales);
  const [catalogo, setCatalogo] = useState(etiquetas);
  const [elegidas, setElegidas] = useState<Etiqueta[]>([]);
  const [error, setError] = useState("");
  const [dx, setDx] = useState(0);
  const [saliendo, setSaliendo] = useState<"izq" | "der" | null>(null);
  const [pending, startTransition] = useTransition();
  const inicio = useRef<{ x: number; y: number; id: number } | null>(null);

  const actual = cola[indice];
  const hechas = historial.length;

  function avanzar(direccion: "izq" | "der", hecho: Hecho) {
    setSaliendo(direccion);
    setTimeout(() => {
      setHistorial((h) => [...h, hecho]);
      setIndice((i) => i + 1);
      setElegidas([]);
      setDx(0);
      setSaliendo(null);
    }, 180);
  }

  function onClasificar() {
    if (!actual || pending) return;
    if (elegidas.length === 0) {
      setError("Elige al menos una etiqueta o archiva.");
      setDx(0);
      return;
    }
    setError("");
    const r = actual;
    const ids = elegidas.map((e) => e.id);
    startTransition(async () => {
      const res = await clasificar(r.id, r.persona.id, ids);
      if (!res.ok) {
        setError(res.error);
        setDx(0);
        return;
      }
      setPuntos((p) => p + 1);
      avanzar("der", { relacion: r, accion: "clasificar", añadidas: res.data?.añadidas ?? [] });
    });
  }

  function onArchivar() {
    if (!actual || pending) return;
    setError("");
    const r = actual;
    startTransition(async () => {
      const res = await cambiarEstado(r.id, "archivada");
      if (!res.ok) {
        setError(res.error);
        setDx(0);
        return;
      }
      setPuntos((p) => p + 1);
      avanzar("izq", { relacion: r, accion: "archivar", añadidas: [] });
    });
  }

  function onDeshacer() {
    const ultimo = historial[historial.length - 1];
    if (!ultimo || pending) return;
    setError("");
    startTransition(async () => {
      const res = await deshacer(ultimo.relacion.id, ultimo.relacion.persona.id, ultimo.añadidas);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPuntos((p) => p - 1);
      setHistorial((h) => h.slice(0, -1));
      setIndice((i) => i - 1);
      setElegidas([]);
    });
  }

  async function crear(nombre: string, tipo: Etiqueta["tipo"]) {
    const res = await crearEtiqueta(nombre, tipo);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setCatalogo((c) => (c.some((x) => x.id === res.data!.id) ? c : [...c, res.data!]));
    return res.data!;
  }

  // Gestos: solo arrastre horizontal claro sobre la tarjeta (no sobre las etiquetas).
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;
    inicio.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = inicio.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDx(mx);
    }
  }
  function onPointerUp() {
    if (!inicio.current) return;
    inicio.current = null;
    if (dx > UMBRAL_SWIPE) onClasificar();
    else if (dx < -UMBRAL_SWIPE) onArchivar();
    else setDx(0);
  }

  const selectorPeriodo = (
    <div className="mb-4 flex rounded-lg border border-subtle bg-card p-1" role="tablist" aria-label="Periodo">
      {PERIODOS.map((p) => (
        <Link
          key={p.key}
          href={`/ritual?periodo=${p.key}`}
          role="tab"
          aria-selected={periodo === p.key}
          className={`flex min-h-10 flex-1 items-center justify-center rounded-md text-sm font-medium transition ${
            periodo === p.key ? "bg-icam-900 text-white" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );

  const marcador = (
    <div className="mb-3 flex items-center justify-between text-sm">
      <span className="text-text-muted">
        {Math.min(indice + 1, cola.length)} de {cola.length}
        {hechas > 0 ? ` · ${hechas} hecha${hechas === 1 ? "" : "s"}` : ""}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-icam-gold/15 px-2.5 py-1 font-semibold text-[#7d6235]">
        {puntos} pts · {((puntos % porBono) + porBono) % porBono}/{porBono}
      </span>
    </div>
  );

  if (!actual) {
    return (
      <>
        {selectorPeriodo}
        {cola.length > 0 ? marcador : null}
        <EmptyState
          title={cola.length > 0 ? "¡Ritual completado!" : "Nada pendiente en este periodo"}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              {historial.length > 0 ? (
                <button type="button" onClick={onDeshacer} disabled={pending} className={btn.secondary}>
                  <Icon name="undo" className="h-4 w-4" /> Deshacer la última
                </button>
              ) : null}
              {periodo !== "todo" && totalPendientes - hechas > 0 ? (
                <Link href="/ritual?periodo=todo" className={btn.primary}>
                  Ver los {totalPendientes - hechas} pendientes de otros periodos
                </Link>
              ) : (
                <button type="button" onClick={() => router.push("/")} className={btn.primary}>
                  Volver al inicio
                </button>
              )}
            </div>
          }
        >
          {hechas > 0 ? `Has clasificado o archivado ${hechas} contacto${hechas === 1 ? "" : "s"} en esta sesión.` : "Cuando tengas reuniones nuevas aparecerán aquí."}
        </EmptyState>
      </>
    );
  }

  const p = actual.persona;
  const rot = dx / 20;
  const transform = saliendo
    ? `translateX(${saliendo === "der" ? 120 : -120}%) rotate(${saliendo === "der" ? 12 : -12}deg)`
    : `translateX(${dx}px) rotate(${rot}deg)`;

  return (
    <>
      {selectorPeriodo}
      {marcador}

      <div className="relative">
        {/* Indicadores de dirección */}
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-4" aria-hidden="true">
          <span className={`rounded-md border-2 border-red-500 px-2 py-1 text-sm font-bold text-red-600 transition-opacity ${dx < -30 ? "opacity-100" : "opacity-0"}`}>
            ARCHIVAR
          </span>
          <span className={`rounded-md border-2 border-emerald-600 px-2 py-1 text-sm font-bold text-emerald-700 transition-opacity ${dx > 30 ? "opacity-100" : "opacity-0"}`}>
            CLASIFICAR
          </span>
        </div>

        <article
          className={`${card} relative touch-pan-y select-none p-4 sm:p-6 ${dx === 0 || saliendo ? "transition-transform duration-200" : ""}`}
          style={{ transform }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex items-start gap-4">
            <Avatar nombre={p.nombre} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-text-primary">{p.nombre}</h2>
              <p className="text-sm text-text-muted">
                {[p.cargo, p.empresa?.nombre].filter(Boolean).join(" · ") || "Sin cargo ni empresa"}
              </p>
              <p className="truncate text-sm text-text-muted">{p.email ?? p.telefono}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
            <Icon name="calendar" className="h-3.5 w-3.5" />
            {actual.origen === "manual" ? "Añadido a mano" : actual.origen === "bolsa" ? "Adoptado de la bolsa común" : "Reunión"} ·{" "}
            {fmtFecha(actual.ultima_reunion ?? actual.created_at)}
          </p>
          {actual.notas ? <p className="mt-2 rounded-md bg-page px-3 py-2 text-sm">{actual.notas}</p> : null}

          <div className="mt-4" data-no-swipe>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">¿Quién es?</p>
            <TagPicker
              quick
              selected={elegidas}
              all={catalogo}
              onAdd={(e) => setElegidas((s) => (s.some((x) => x.id === e.id) ? s : [...s, e]))}
              onRemove={(e) => setElegidas((s) => s.filter((x) => x.id !== e.id))}
              onCreate={crear}
              disabled={pending}
            />
          </div>
        </article>
      </div>

      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-2">
        <button type="button" onClick={onArchivar} disabled={pending} className={btn.danger}>
          <Icon name="archive" className="h-4 w-4" /> Archivar
        </button>
        <button
          type="button"
          onClick={onDeshacer}
          disabled={pending || historial.length === 0}
          className={`${btn.secondary} px-3`}
          aria-label="Deshacer"
          title="Deshacer"
        >
          <Icon name="undo" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClasificar} disabled={pending} className={btn.primary}>
          <Icon name="check" className="h-4 w-4" /> Clasificar
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-text-muted">1 punto por persona, archivar puntúa igual · {porBono} puntos = bono</p>
    </>
  );
}
