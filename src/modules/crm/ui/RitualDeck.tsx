"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { useFx } from "@/components/fx/FxProvider";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { fmtFecha } from "@/lib/format";
import { archivarVarias, cambiarEstado, clasificar, crearEtiqueta, deshacer } from "@/modules/crm/actions";
import type { EventoGrande } from "@/modules/crm/data";
import type { Etiqueta, Relacion } from "@/modules/crm/types";
import { Avatar } from "@/modules/crm/ui/ContactList";
import { etiquetasRapidas, TagPicker } from "@/modules/crm/ui/TagPicker";

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
  eventos: eventosIniciales = [],
  etiquetas,
  periodo,
  totalPendientes,
  puntosIniciales,
  porBono,
}: {
  cola: Relacion[];
  eventos?: EventoGrande[];
  etiquetas: Etiqueta[];
  periodo: "semana" | "mes" | "todo";
  totalPendientes: number;
  puntosIniciales: number;
  porBono: number;
}) {
  const router = useRouter();
  const fx = useFx();
  const marcadorRef = useRef<HTMLSpanElement>(null);
  // La cola se congela al empezar: cada acción revalida la página y la cola del
  // servidor ya no traería las tarjetas hechas, lo que descuadraría el índice.
  // Los asistentes de eventos grandes salen de la cola: van en su tarjeta «Evento».
  const [eventos, setEventos] = useState(eventosIniciales);
  const [cola, setCola] = useState(() => {
    const enEventos = new Set(eventosIniciales.flatMap((e) => e.relacionIds));
    return colaInicial.filter((r) => !enEventos.has(r.id));
  });
  const [archivadasEnEventos, setArchivadasEnEventos] = useState(0);
  const [indice, setIndice] = useState(0);
  const [historial, setHistorial] = useState<Hecho[]>([]);
  const [puntos, setPuntos] = useState(puntosIniciales);
  const [catalogo, setCatalogo] = useState(etiquetas);
  // Selección de etiquetas por tarjeta: al avanzar, la siguiente empieza limpia sin esperar a otro render.
  const [seleccion, setSeleccion] = useState<Record<string, Etiqueta[]>>({});
  const [error, setError] = useState("");
  const [dx, setDx] = useState(0);
  const [saliendo, setSaliendo] = useState<"izq" | "der" | "abajo" | null>(null);
  const [pending, startTransition] = useTransition();
  const inicio = useRef<{ x: number; y: number; id: number } | null>(null);
  // El desplazamiento vive también en una ref: al soltar, el estado puede ir un render por detrás.
  const dxRef = useRef(0);
  const etiquetaInputRef = useRef<HTMLInputElement>(null);

  const actual = cola[indice];
  const elegidas = actual ? (seleccion[actual.id] ?? []) : [];
  const setElegidas = (fn: (s: Etiqueta[]) => Etiqueta[]) =>
    actual && setSeleccion((m) => ({ ...m, [actual.id]: fn(m[actual.id] ?? []) }));
  const hechas = historial.length + archivadasEnEventos;
  const evento = eventos[0];

  function revisarUnoAUno(ev: EventoGrande) {
    const ids = new Set(ev.relacionIds);
    const rels = colaInicial.filter((r) => ids.has(r.id));
    setCola((c) => [...c.slice(0, indice), ...rels, ...c.slice(indice)]);
    setEventos((es) => es.filter((e) => e.reunionId !== ev.reunionId));
  }

  function archivarEvento(ev: EventoGrande) {
    setError("");
    startTransition(async () => {
      const res = await archivarVarias(ev.relacionIds);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const n = res.data?.archivadas ?? 0;
      setArchivadasEnEventos((a) => a + n);
      setEventos((es) => es.filter((e) => e.reunionId !== ev.reunionId));
    });
  }

  /** «+N» flotante y, si se cruza un múltiplo de `porBono`, celebración de bono. */
  function premiar(n: number) {
    fx.flotar(`+${n}`, marcadorRef.current);
    if (Math.floor((puntos + n) / porBono) > Math.floor(puntos / porBono)) {
      fx.celebrar("bono");
      fx.avisar({ icon: "star", titulo: "Bono conseguido", detalle: `Has llegado a ${puntos + n} puntos` });
    }
  }

  function avanzar(direccion: "izq" | "der", hecho: Hecho) {
    if (indice + 1 === cola.length && eventos.length === 0) {
      window.setTimeout(() => {
        fx.avisar({ icon: "check", titulo: "Ritual completado", detalle: `${hechas + 1} contactos al día` });
      }, 250);
    }
    setSaliendo(direccion);
    setTimeout(() => {
      setHistorial((h) => [...h, hecho]);
      setIndice((i) => i + 1);
      setDx(0);
      setSaliendo(null);
    }, 180);
  }

  function onClasificar() {
    // `saliendo`: la acción ya resolvió pero la tarjeta sigue en pantalla 180 ms;
    // un segundo toque actuaría otra vez sobre la misma relación.
    if (!actual || pending || saliendo) return;
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
      premiar(1);
      avanzar("der", { relacion: r, accion: "clasificar", añadidas: res.data?.añadidas ?? [] });
    });
  }

  function onArchivar() {
    if (!actual || pending || saliendo) return;
    setError("");
    const r = actual;
    startTransition(async () => {
      const res = await cambiarEstado(r.id, "archivada");
      if (!res.ok) {
        setError(res.error);
        setDx(0);
        return;
      }
      avanzar("izq", { relacion: r, accion: "archivar", añadidas: [] });
    });
  }

  /** Manda la tarjeta al final de la cola de esta sesión: sin puntos ni cambios en la base de datos. */
  function onPosponer() {
    if (!actual || pending || saliendo || indice + 1 >= cola.length) return;
    setError("");
    const r = actual;
    setSaliendo("abajo");
    setTimeout(() => {
      setCola((c) => [...c.filter((x) => x.id !== r.id), r]);
      setDx(0);
      setSaliendo(null);
    }, 180);
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
      if (ultimo.accion === "clasificar") setPuntos((p) => p - 1);
      setHistorial((h) => h.slice(0, -1));
      setIndice((i) => i - 1);
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
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Algunos punteros (sintéticos, ya liberados) no admiten captura; el gesto sigue igual.
      }
      dxRef.current = mx;
      setDx(mx);
    }
  }
  function onPointerUp() {
    if (!inicio.current) return;
    inicio.current = null;
    const final = dxRef.current;
    dxRef.current = 0;
    if (final > UMBRAL_SWIPE) onClasificar();
    else if (final < -UMBRAL_SWIPE) onArchivar();
    else setDx(0);
  }

  // Teclado: 1–9 etiquetas, →/Enter clasificar, ← archivar, ↓ posponer, Z deshacer, / otra etiqueta.
  // Se vuelve a registrar en cada render para que los manejadores vean el estado actual.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      const deshacerConModificador = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z";
      if (!deshacerConModificador && (e.ctrlKey || e.metaKey || e.altKey)) return;
      // Enter sobre un enlace con foco lo sigue. Sobre un botón (p. ej. la última etiqueta
      // pulsada con el ratón) clasifica: preventDefault evita que además se vuelva a pulsar.
      if (e.key === "Enter" && el?.closest("a")) return;

      let hecho = true;
      if (evento) {
        if (e.key === "ArrowRight" || e.key === "Enter") revisarUnoAUno(evento);
        else if (e.key === "ArrowLeft") archivarEvento(evento);
        else hecho = false;
      } else if (deshacerConModificador || e.key === "z" || e.key === "Z") {
        onDeshacer();
      } else if (!actual) {
        hecho = false;
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        onClasificar();
      } else if (e.key === "ArrowLeft") {
        onArchivar();
      } else if (e.key === "ArrowDown") {
        onPosponer();
      } else if (e.key === "/") {
        etiquetaInputRef.current?.focus();
      } else if (/^[1-9]$/.test(e.key)) {
        const etiqueta = etiquetasRapidas(catalogo)[Number(e.key) - 1];
        if (etiqueta && !pending) {
          setError("");
          setElegidas((s) => (s.some((x) => x.id === etiqueta.id) ? s.filter((x) => x.id !== etiqueta.id) : [...s, etiqueta]));
        }
      } else {
        hecho = false;
      }
      if (hecho) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
      <span ref={marcadorRef} className="inline-flex items-center gap-1 rounded-full bg-icam-gold/15 px-2.5 py-1 font-semibold text-[#7d6235]">
        <AnimatedNumber value={puntos} /> pts · {((puntos % porBono) + porBono) % porBono}/{porBono}
      </span>
    </div>
  );

  if (evento) {
    return (
      <>
        {selectorPeriodo}
        {marcador}
        <article className={`${card} p-4 sm:p-6`}>
          <p className="text-xs font-medium uppercase tracking-wider text-icam-gold">Evento</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">{evento.asunto ?? "(sin asunto)"}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
            <Icon name="calendar" className="h-4 w-4" />
            {fmtFecha(evento.fecha)} · {evento.nExternos} externos
          </p>
          <p className="mt-3 text-sm">
            <strong>{evento.relacionIds.length} contactos nuevos</strong> de esta reunión. Si fue un evento
            multitudinario, puedes archivarlos de una vez (sin puntos) o revisarlos uno a uno para clasificarlos.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" className={btn.danger} disabled={pending} onClick={() => archivarEvento(evento)}>
              <Icon name="archive" className="h-4 w-4" /> Archivar todos
            </button>
            <button type="button" className={btn.primary} disabled={pending} onClick={() => revisarUnoAUno(evento)}>
              Revisar uno a uno
            </button>
          </div>
          <p className="mt-3 text-xs text-text-muted">Los archivados se pueden recuperar desde Mis contactos.</p>
        </article>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </>
    );
  }

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
  const transform =
    saliendo === "abajo"
      ? "translateY(24px) scale(0.96)"
      : saliendo
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
          key={actual.id}
          className={`${card} relative touch-pan-y select-none p-4 sm:p-6 ${dx === 0 || saliendo ? "transition-[transform,opacity] duration-200" : ""}`}
          style={{ transform, opacity: saliendo === "abajo" ? 0 : 1 }}
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
              atajos
              inputRef={etiquetaInputRef}
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
      <button
        type="button"
        onClick={onPosponer}
        disabled={pending || indice + 1 >= cola.length}
        className={`${btn.ghost} mt-2 w-full`}
        title={indice + 1 >= cola.length ? "Es el último contacto de la cola" : "Pasar al final de la cola"}
      >
        <Icon name="clock" className="h-4 w-4" /> Posponer
      </button>
      <p className="mt-3 hidden text-center text-xs text-text-muted [@media(hover:hover)]:block">
        Teclado: <Kbd>1</Kbd>–<Kbd>9</Kbd> etiquetas · <Kbd>→</Kbd>/<Kbd>Enter</Kbd> clasificar · <Kbd>←</Kbd> archivar ·{" "}
        <Kbd>↓</Kbd> posponer · <Kbd>Z</Kbd> deshacer · <Kbd>/</Kbd> otra etiqueta
      </p>
      <p className="mt-3 text-center text-xs text-text-muted">1 punto por contacto clasificado · {porBono} puntos = bono</p>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-subtle bg-card px-1 font-mono text-[11px] text-text-body">{children}</kbd>;
}
