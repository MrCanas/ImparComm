"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import { crearHito } from "@/modules/crm/actions";
import { TIPOS_HITO, type Etiqueta } from "@/modules/crm/types";

export function NuevoHitoForm({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ambito, setAmbito] = useState<"general" | "personal">("general");
  const [pending, startTransition] = useTransition();
  const visibles = etiquetas.filter((e) => ambito === "personal" || e.tipo === "general");

  function onSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const res = await crearHito(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/hitos/${res.data!.id}`);
    });
  }

  return (
    <form action={onSubmit} className={`${card} space-y-4 p-4 sm:p-6`}>
      <div>
        <label htmlFor="h-nombre" className={label}>Nombre *</label>
        <input id="h-nombre" name="nombre" required className={input} placeholder="Ej. Lanzamiento Fondo IV" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="h-tipo" className={label}>Tipo</label>
          <select id="h-tipo" name="tipo" className={input} defaultValue="">
            <option value="">—</option>
            {TIPOS_HITO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="h-fecha" className={label}>Fecha</label>
          <input id="h-fecha" name="fecha" type="date" className={input} />
        </div>
      </div>
      <fieldset>
        <legend className={label}>Ámbito</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["general", "personal"] as const).map((a) => (
            <label
              key={a}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${
                ambito === a ? "border-icam-900 bg-icam-900/5 font-medium" : "border-subtle"
              }`}
            >
              <input type="radio" name="ambito" value={a} checked={ambito === a} onChange={() => setAmbito(a)} className="accent-icam-900" />
              {a === "general" ? "General (todo el equipo)" : "Personal (solo yo)"}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>Etiquetas de filtro</legend>
        <div className="flex flex-wrap gap-1.5">
          {visibles.map((e) => (
            <label key={e.id} className="cursor-pointer">
              <input type="checkbox" name="etiquetas" value={e.id} className="peer sr-only" />
              <span
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition peer-checked:border-icam-900 peer-checked:bg-icam-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-icam-900/30 ${
                  e.tipo === "general" ? "border-subtle" : "border-dashed border-icam-gold/70"
                }`}
              >
                {e.nombre}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">Sin filtro, todos tus contactos clasificados serán candidatos.</p>
      </fieldset>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={btn.secondary} onClick={() => router.back()}>Cancelar</button>
        <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Creando…" : "Abrir hito"}</button>
      </div>
    </form>
  );
}
