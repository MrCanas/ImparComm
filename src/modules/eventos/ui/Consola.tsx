"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { btn, card, input } from "@/components/ui/styles";

import { cambiarEstadoEnvio, estadoEnvio, iniciarEnvio, pasoEnvio, pendientesAlIniciar, resolverDestinatario } from "../actions";
import type { Destinatario, Envio } from "../types";
import { fechaHora } from "./comun";

interface Linea {
  hora: string;
  texto: string;
  tono: "ok" | "error" | "info" | "aviso";
}

const ESTADO: Record<Envio["estado"], { texto: string; tono: "gold" | "green" | "muted" | "red" | "navy" }> = {
  borrador: { texto: "Borrador", tono: "muted" },
  en_curso: { texto: "Enviando", tono: "green" },
  pausado: { texto: "En pausa", tono: "gold" },
  completado: { texto: "Completado", tono: "navy" },
  cancelado: { texto: "Cancelado", tono: "red" },
};

/**
 * Consola de envío. Esta pestaña ES el motor: pide «envía el siguiente» al
 * servidor, espera lo que diga la base y vuelve a pedir. Si se cierra la
 * pestaña, el envío se detiene (nada sigue en segundo plano). Solo una pestaña
 * puede enviar a la vez (candado en la base).
 */
export function Consola({
  envio: inicial,
  conteo: conteoInicial,
  destinatarios,
  modoPrueba,
  enviadosHoy,
  topeDiario,
}: {
  envio: Envio;
  conteo: Record<string, number>;
  destinatarios: Destinatario[];
  modoPrueba: boolean;
  enviadosHoy: number;
  topeDiario: number;
}) {
  const router = useRouter();
  const [envio, setEnvio] = useState(inicial);
  const [conteo, setConteo] = useState(conteoInicial);
  const [registro, setRegistro] = useState<Linea[]>([]);
  const [activa, setActiva] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [esperado, setEsperado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const sesion = useRef<string>("");
  const parar = useRef(false);
  const corriendo = useRef(false);

  useEffect(() => {
    sesion.current = crypto.randomUUID();
  }, []);
  // Al refrescar la página llegan props nuevas: se adoptan durante el render (patrón de React, sin efecto).
  const [previo, setPrevio] = useState(inicial);
  if (previo !== inicial) {
    setPrevio(inicial);
    setEnvio(inicial);
    setConteo(conteoInicial);
  }

  const log = useCallback((texto: string, tono: Linea["tono"] = "info") => {
    setRegistro((r) => [{ hora: new Date().toLocaleTimeString("es-ES"), texto, tono }, ...r].slice(0, 300));
  }, []);

  const refrescar = useCallback(async () => {
    const r = await estadoEnvio(inicial.id);
    if (r.ok && r.data) {
      setEnvio(r.data.envio);
      setConteo(r.data.conteo);
      return r.data.envio;
    }
    return null;
  }, [inicial.id]);

  // Aviso al cerrar la pestaña con el envío en marcha.
  useEffect(() => {
    if (!activa) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [activa]);

  const bucle = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    parar.current = false;
    setActiva(true);
    log("Esta pestaña está enviando. No la cierres hasta que termine o pulses Pausar.", "aviso");
    try {
      while (!parar.current) {
        const r = await pasoEnvio(inicial.id, sesion.current);
        if (!r.ok) {
          log(`Error: ${r.error}`, "error");
          break;
        }
        const p = r.data!;
        if (p.status === "espera") {
          await new Promise((res) => setTimeout(res, Math.min(Math.max(p.esperaMs, 250), 60_000)));
          continue;
        }
        if (p.status === "ok") {
          if (p.resultado === "enviado") log(`Enviado a ${p.email} (${p.ms} ms)`, "ok");
          else log(`${p.resultado === "incierto" ? "INCIERTO" : "Error"} con ${p.email}: ${p.error ?? ""}`, "error");
          setConteo((c) => ({ ...c, pendiente: Math.max(0, (c.pendiente ?? 0) - 1), [p.resultado]: (c[p.resultado] ?? 0) + 1 }));
          if (p.pausado) {
            log(`Pausa automática: ${p.pausado}`, "aviso");
            break;
          }
          continue;
        }
        const mensajes: Record<string, string> = {
          candado: "Otra pestaña o persona está enviando este envío. Esta pestaña solo observa.",
          no_activo: `El envío no está en curso${p.detalle ? `: ${p.detalle}` : ""}.`,
          tope: `Tope diario alcanzado (${p.detalle ?? ""}). El envío queda en pausa hasta mañana.`,
          incierto: "Una reserva anterior quedó sin cerrar: el envío se ha pausado. Revisa los inciertos.",
          completado: "Envío completado: no quedan destinatarios pendientes.",
        };
        log(mensajes[p.status] ?? p.status, p.status === "completado" ? "ok" : "aviso");
        break;
      }
    } finally {
      corriendo.current = false;
      setActiva(false);
      await refrescar();
      router.refresh();
    }
  }, [inicial.id, log, refrescar, router]);

  function prepararInicio() {
    setError(null);
    start(async () => {
      const r = await pendientesAlIniciar(inicial.id);
      if (!r.ok) return setError(r.error);
      setEsperado(r.data!.pendientes);
      setConfirmacion("");
    });
  }

  function iniciar() {
    setError(null);
    start(async () => {
      const r = await iniciarEnvio(inicial.id, confirmacion);
      if (!r.ok) return setError(r.error);
      setEsperado(null);
      log(`${envio.estado === "borrador" ? "Iniciado" : "Reanudado"}: ${r.data!.destinatarios} pendientes (con la plantilla y el segmento vigentes).`, "info");
      await refrescar();
      void bucle();
    });
  }

  function pausar() {
    parar.current = true;
    start(async () => {
      const r = await cambiarEstadoEnvio(inicial.id, "pausado", "Pausado a mano");
      if (!r.ok) setError(r.error);
      else log("Pausado. Puedes editar la plantilla, el segmento o el ritmo y reanudar.", "aviso");
      await refrescar();
    });
  }

  function cancelar() {
    if (!window.confirm("¿Cancelar el envío? No se podrá reanudar.")) return;
    parar.current = true;
    start(async () => {
      const r = await cambiarEstadoEnvio(inicial.id, "cancelado", null);
      if (!r.ok) setError(r.error);
      await refrescar();
    });
  }

  const inciertos = destinatarios.filter((d) => d.estado === "incierto" || d.estado === "error");
  const total = Object.values(conteo).reduce((a, b) => a + b, 0);
  const hechos = (conteo.enviado ?? 0) + (conteo.error ?? 0) + (conteo.omitido ?? 0) + (conteo.incierto ?? 0);
  const est = ESTADO[envio.estado];

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={est.tono}>{est.texto}</Badge>
          {modoPrueba ? <Badge tone="gold">Modo prueba: solo @yopmail.com</Badge> : <Badge tone="red">Envío real</Badge>}
          <span className="text-sm text-text-muted">Hoy: {enviadosHoy} / {topeDiario} correos</span>
          {activa ? <span className="ml-auto animate-pulse text-sm font-medium text-emerald-700">● Esta pestaña está enviando</span> : null}
        </div>
        {envio.motivo_pausa && envio.estado === "pausado" ? <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{envio.motivo_pausa}</p> : null}
        <div className="h-2 overflow-hidden rounded bg-page">
          <div className="h-full bg-icam-900 transition-all" style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
          {(["pendiente", "enviado", "error", "incierto", "omitido", "enviando"] as const).map((k) => (
            <div key={k} className="rounded bg-page p-2">
              <p className="text-lg font-semibold text-text-primary">{conteo[k] ?? 0}</p>
              <p className="text-xs capitalize text-text-muted">{k}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(envio.estado === "borrador" || envio.estado === "pausado") && !activa ? (
            <button type="button" className={btn.primary} onClick={prepararInicio} disabled={pendiente}>
              {envio.estado === "borrador" ? "Iniciar envío…" : "Reanudar…"}
            </button>
          ) : null}
          {envio.estado === "en_curso" && !activa ? (
            <button type="button" className={btn.primary} onClick={() => void bucle()} disabled={pendiente}>
              Continuar enviando desde esta pestaña
            </button>
          ) : null}
          {envio.estado === "en_curso" ? (
            <button type="button" className={btn.gold} onClick={pausar} disabled={pendiente}>Pausar</button>
          ) : null}
          {envio.estado !== "completado" && envio.estado !== "cancelado" ? (
            <button type="button" className={btn.danger} onClick={cancelar} disabled={pendiente || activa}>Cancelar envío</button>
          ) : null}
        </div>

        {esperado !== null ? (
          <div className="space-y-2 rounded-md border border-icam-900/30 p-3">
            <p className="text-sm">
              Se enviará a <strong>{esperado}</strong> destinatarios con la plantilla y el segmento vigentes, a un correo cada {envio.delay_ms / 1000} s
              (≈ {Math.ceil((esperado * envio.delay_ms) / 60000)} min). Para confirmar escribe <strong>ENVIAR {esperado}</strong>:
            </p>
            <div className="flex gap-2">
              <input className={`${input} max-w-xs`} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder={`ENVIAR ${esperado}`} autoFocus />
              <button type="button" className={btn.primary} onClick={iniciar} disabled={pendiente || confirmacion.trim().toUpperCase() !== `ENVIAR ${esperado}`}>
                Confirmar
              </button>
              <button type="button" className={btn.ghost} onClick={() => setEsperado(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {inciertos.length ? (
        <div className={`${card} p-4`}>
          <p className="mb-2 font-medium text-text-primary">Por revisar ({inciertos.length})</p>
          <p className="mb-2 text-sm text-text-muted">
            «Incierto» = se cortó la conexión mientras se enviaba: no sabemos si llegó. Compruébalo (p. ej. en el buzón de prueba) y decide. Nada se reenvía solo.
          </p>
          <ul className="space-y-2 text-sm">
            {inciertos.map((d) => (
              <li key={d.invitado_id} className="flex flex-wrap items-center gap-2 border-b border-subtle/40 pb-2">
                <Badge tone="red">{d.estado}</Badge>
                <span>{d.email}</span>
                <span className="text-xs text-text-muted">{d.error}</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" className={btn.secondary} disabled={pendiente || activa} onClick={() => start(async () => { await resolverDestinatario(inicial.id, d.invitado_id, "marcar_enviado"); router.refresh(); })}>Llegó</button>
                  <button type="button" className={btn.secondary} disabled={pendiente || activa} onClick={() => start(async () => { await resolverDestinatario(inicial.id, d.invitado_id, "reintentar"); router.refresh(); })}>Reintentar</button>
                  <button type="button" className={btn.ghost} disabled={pendiente || activa} onClick={() => start(async () => { await resolverDestinatario(inicial.id, d.invitado_id, "omitir"); router.refresh(); })}>Omitir</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} p-4`}>
          <p className="mb-2 font-medium text-text-primary">Registro en directo</p>
          <ul className="max-h-96 space-y-1 overflow-auto font-mono text-xs">
            {registro.length ? registro.map((l, i) => (
              <li key={i} className={l.tono === "ok" ? "text-emerald-700" : l.tono === "error" ? "text-red-700" : l.tono === "aviso" ? "text-amber-700" : "text-text-muted"}>
                {l.hora} · {l.texto}
              </li>
            )) : <li className="text-text-muted">Sin actividad en esta pestaña.</li>}
          </ul>
        </div>
        <div className={`${card} p-4`}>
          <p className="mb-2 font-medium text-text-primary">Destinatarios ({destinatarios.length})</p>
          <ul className="max-h-96 overflow-auto text-xs">
            {destinatarios.map((d) => (
              <li key={d.invitado_id} className="flex gap-2 border-b border-subtle/40 py-1">
                <span className="w-20 shrink-0">{d.estado}</span>
                <span className="truncate">{d.email}</span>
                <span className="ml-auto shrink-0 text-text-muted">{d.enviado_en ? fechaHora(d.enviado_en) : ""}{d.plantilla_version ? ` · v${d.plantilla_version}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
