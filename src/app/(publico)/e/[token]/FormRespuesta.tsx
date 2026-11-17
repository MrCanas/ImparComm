"use client";

import { useState, useTransition } from "react";

import { responder } from "../../acciones";

type R = "si" | "no" | "quizas";

const OPCIONES: { v: R; t: string }[] = [
  { v: "si", t: "Asistiré" },
  { v: "quizas", t: "Quizás" },
  { v: "no", t: "No podré" },
];

export function FormRespuesta({
  token,
  inicial,
  preseleccion,
  permiteAcompanante,
  abierto,
  gracias,
  calendario,
}: {
  token: string;
  inicial: { respuesta: R | null; acompanante: boolean; acompanante_nombre: string | null; telefono: string | null; comentario: string | null };
  preseleccion: R | null;
  permiteAcompanante: boolean;
  abierto: boolean;
  gracias: Record<R, string>;
  calendario: { ics: string; google: string; outlook: string };
}) {
  const [respuesta, setRespuesta] = useState<R | null>(preseleccion ?? inicial.respuesta);
  const [acomp, setAcomp] = useState(inicial.acompanante);
  const [guardada, setGuardada] = useState<R | null>(null);
  const [editar, setEditar] = useState(inicial.respuesta === null || preseleccion !== null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const titulo = "font-[family-name:var(--font-titulo)] uppercase tracking-[0.12em] text-[#1E2A56]";
  const actual = guardada ?? inicial.respuesta;

  if (!abierto) {
    return (
      <div className="space-y-2 text-center">
        <p>El plazo para responder ha terminado.</p>
        {actual ? <p className="text-sm text-[#6E6E6E]">Tu respuesta registrada: <strong>{OPCIONES.find((o) => o.v === actual)?.t}</strong>.</p> : null}
      </div>
    );
  }

  if (!editar && actual) {
    return (
      <div className="space-y-5 text-center">
        <p className={`${titulo} text-lg`}>{guardada ? "Gracias" : "Tu respuesta"}</p>
        <p>{gracias[actual]}</p>
        {actual !== "no" ? <Calendario c={calendario} /> : null}
        <button type="button" className="text-sm text-[#1E2A56] underline" onClick={() => setEditar(true)}>Cambiar mi respuesta</button>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      action={(f) => {
        setError(null);
        start(async () => {
          const r = await responder(token, f);
          if (!r.ok) return setError(r.error);
          setGuardada(r.respuesta);
          setEditar(false);
        });
      }}
    >
      <fieldset>
        <legend className={`${titulo} mb-3 block w-full text-center text-sm`}>¿Nos acompañas?</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPCIONES.map((o) => (
            <label
              key={o.v}
              className={`flex min-h-12 cursor-pointer items-center justify-center border px-2 text-center text-sm font-bold uppercase tracking-wider transition ${
                respuesta === o.v ? "border-[#1E2A56] bg-[#1E2A56] text-white" : "border-[#1E2A56]/30 bg-white text-[#1E2A56] hover:border-[#1E2A56]"
              }`}
            >
              <input type="radio" name="respuesta" value={o.v} checked={respuesta === o.v} onChange={() => setRespuesta(o.v)} className="sr-only" />
              {o.t}
            </label>
          ))}
        </div>
      </fieldset>

      {respuesta && respuesta !== "no" ? (
        <div className="space-y-3">
          {permiteAcompanante ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="acompanante" checked={acomp} onChange={(e) => setAcomp(e.target.checked)} className="h-4 w-4" />
                Vendré acompañado/a
              </label>
              {acomp ? (
                <input name="acompanante_nombre" defaultValue={inicial.acompanante_nombre ?? ""} maxLength={120} placeholder="Nombre y apellidos del acompañante" className="w-full border border-[#D9D9D9] bg-white px-3 py-3 text-sm" />
              ) : null}
            </>
          ) : null}
          <input name="telefono" type="tel" defaultValue={inicial.telefono ?? ""} maxLength={40} placeholder="Teléfono de contacto (opcional)" className="w-full border border-[#D9D9D9] bg-white px-3 py-3 text-sm" />
        </div>
      ) : null}
      {respuesta ? (
        <textarea name="comentario" defaultValue={inicial.comentario ?? ""} maxLength={1000} rows={3} placeholder="Comentario (opcional)" className="w-full border border-[#D9D9D9] bg-white px-3 py-3 text-sm" />
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={!respuesta || pendiente}
        className="min-h-12 w-full bg-[#B89660] px-4 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-[#a5844f] disabled:opacity-50"
      >
        {pendiente ? "Enviando…" : "Confirmar respuesta"}
      </button>
    </form>
  );
}

function Calendario({ c }: { c: { ics: string; google: string; outlook: string } }) {
  const b = "flex min-h-11 items-center justify-center border border-[#1E2A56]/30 bg-white px-3 text-xs font-bold uppercase tracking-wider text-[#1E2A56] hover:border-[#1E2A56]";
  return (
    <div className="space-y-2">
      <p className="text-sm text-[#6E6E6E]">Añádelo a tu calendario:</p>
      <div className="grid grid-cols-3 gap-2">
        <a className={b} href={c.ics}>Apple / .ics</a>
        <a className={b} href={c.google} target="_blank" rel="noopener noreferrer">Google</a>
        <a className={b} href={c.outlook} target="_blank" rel="noopener noreferrer">Outlook</a>
      </div>
    </div>
  );
}
