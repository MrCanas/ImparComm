"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";

import { actualizarEvento, crearEvento } from "../actions";
import type { Evento } from "../types";
import { aLocalMadrid } from "./comun";

export function EventoForm({ evento }: { evento?: Evento }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function enviar(f: FormData) {
    setError(null);
    setOk(false);
    start(async () => {
      const r = evento ? await actualizarEvento(evento.id, f) : await crearEvento(f);
      if (!r.ok) return setError(r.error);
      if (!evento && r.data && "id" in r.data) router.push(`/eventos/${r.data.id}`);
      else setOk(true);
    });
  }

  const l = evento?.landing ?? {};
  return (
    <form action={enviar} className={`${card} space-y-4 p-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="nombre">Nombre del evento</label>
          <input id="nombre" name="nombre" required className={input} defaultValue={evento?.nombre} placeholder="Cóctel de Navidad 2026" />
        </div>
        <div>
          <label className={label} htmlFor="inicio">Inicio (hora de Madrid)</label>
          <input id="inicio" name="inicio" type="datetime-local" required className={input} defaultValue={aLocalMadrid(evento?.inicio)} />
        </div>
        <div>
          <label className={label} htmlFor="fin">Fin</label>
          <input id="fin" name="fin" type="datetime-local" required className={input} defaultValue={aLocalMadrid(evento?.fin)} />
        </div>
        <div>
          <label className={label} htmlFor="lugar">Lugar</label>
          <input id="lugar" name="lugar" className={input} defaultValue={evento?.lugar ?? ""} />
        </div>
        <div>
          <label className={label} htmlFor="direccion">Dirección</label>
          <input id="direccion" name="direccion" className={input} defaultValue={evento?.direccion ?? ""} />
        </div>
        <div>
          <label className={label} htmlFor="mapa_url">Enlace al mapa (https)</label>
          <input id="mapa_url" name="mapa_url" type="url" className={input} defaultValue={evento?.mapa_url ?? ""} />
        </div>
        <div>
          <label className={label} htmlFor="fecha_limite">Fecha límite para responder</label>
          <input id="fecha_limite" name="fecha_limite" type="datetime-local" className={input} defaultValue={aLocalMadrid(evento?.fecha_limite)} />
        </div>
        <div>
          <label className={label} htmlFor="aforo">Aforo (personas)</label>
          <input id="aforo" name="aforo" type="number" min={1} className={input} defaultValue={evento?.aforo ?? ""} />
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" name="permite_acompanante" defaultChecked={evento?.permite_acompanante ?? true} className="h-4 w-4" />
          Se admite acompañante
        </label>
        <div>
          <label className={label} htmlFor="remitente_nombre">Nombre del remitente</label>
          <input id="remitente_nombre" name="remitente_nombre" className={input} defaultValue={evento?.remitente_nombre ?? "Impar Capital"} />
          <p className="mt-1 text-xs text-text-muted">Exchange puede mostrar el nombre del buzón en lugar de este.</p>
        </div>
        <div>
          <label className={label} htmlFor="reply_to">Responder a (Reply-To)</label>
          <input id="reply_to" name="reply_to" type="email" className={input} defaultValue={evento?.reply_to ?? ""} placeholder="persona@imparcapital.com" />
          <p className="mt-1 text-xs text-text-muted">A dónde llegan las respuestas escritas (el remitente es noreply@).</p>
        </div>
      </div>

      <details className="rounded-md border border-subtle p-3">
        <summary className="cursor-pointer text-sm font-medium text-text-primary">Textos de la página de respuesta</summary>
        <div className="mt-3 grid gap-3">
          <div>
            <label className={label} htmlFor="landing_titulo">Título</label>
            <input id="landing_titulo" name="landing_titulo" className={input} defaultValue={l.titulo ?? ""} placeholder="(por defecto, el nombre del evento)" />
          </div>
          <div>
            <label className={label} htmlFor="landing_intro">Introducción</label>
            <textarea id="landing_intro" name="landing_intro" rows={3} className={`${input} py-2`} defaultValue={l.intro ?? ""} />
          </div>
          <div>
            <label className={label} htmlFor="landing_imagen">Imagen de cabecera (URL https)</label>
            <input id="landing_imagen" name="landing_imagen" type="url" className={input} defaultValue={l.imagen ?? ""} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="gracias_si">Mensaje tras «Sí»</label>
              <textarea id="gracias_si" name="gracias_si" rows={2} className={`${input} py-2`} defaultValue={l.gracias_si ?? ""} />
            </div>
            <div>
              <label className={label} htmlFor="gracias_quizas">Tras «Quizás»</label>
              <textarea id="gracias_quizas" name="gracias_quizas" rows={2} className={`${input} py-2`} defaultValue={l.gracias_quizas ?? ""} />
            </div>
            <div>
              <label className={label} htmlFor="gracias_no">Tras «No»</label>
              <textarea id="gracias_no" name="gracias_no" rows={2} className={`${input} py-2`} defaultValue={l.gracias_no ?? ""} />
            </div>
          </div>
        </div>
      </details>

      {evento ? (
        <div className="max-w-xs">
          <label className={label} htmlFor="estado">Estado</label>
          <select id="estado" name="estado" className={input} defaultValue={evento.estado}>
            <option value="borrador">Borrador</option>
            <option value="activo">Activo (la página de respuesta funciona)</option>
            <option value="cerrado">Cerrado (no se admiten respuestas)</option>
          </select>
        </div>
      ) : null}

      {evento ? (
        <p className="text-xs text-text-muted">
          Cambiar nombre, fecha o lugar sube la versión de la invitación de calendario (ahora {evento.ics_sequence}): al reenviar la confirmación, los calendarios se actualizan en vez de duplicarse.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">Guardado.</p> : null}
      <button type="submit" className={btn.primary} disabled={pendiente}>
        {pendiente ? "Guardando…" : evento ? "Guardar cambios" : "Crear evento"}
      </button>
    </form>
  );
}
