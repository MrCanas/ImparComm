"use client";

import { useState, useTransition } from "react";

import { darDeBaja } from "../../acciones";

export function BotonBaja({ token }: { token: string }) {
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  if (hecho) return <p className="text-sm text-[#1E2A56]">Listo: no volverás a recibir estas comunicaciones.</p>;
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          start(async () => {
            const r = await darDeBaja(token);
            if (r.ok) setHecho(true);
            else setError(r.error ?? "Error");
          })
        }
        className="min-h-12 w-full bg-[#1E2A56] px-4 text-sm font-bold uppercase tracking-widest text-white disabled:opacity-50"
      >
        {pendiente ? "…" : "Confirmar la baja"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
