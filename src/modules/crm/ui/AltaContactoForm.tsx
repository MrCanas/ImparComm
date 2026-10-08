"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import { altaManual } from "@/modules/crm/actions";

export function AltaContactoForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const res = await altaManual(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/contactos/${res.data!.personaId}`);
    });
  }

  return (
    <form action={onSubmit} className={`${card} space-y-4 p-4 sm:p-6`}>
      <div>
        <label htmlFor="nombre" className={label}>Nombre y apellidos *</label>
        <input id="nombre" name="nombre" required autoComplete="off" className={input} autoFocus />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="telefono" className={label}>Teléfono</label>
          <input id="telefono" name="telefono" type="tel" inputMode="tel" autoComplete="off" className={input} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-muted">Email o, como mínimo, teléfono: evita duplicados al pasar a Zoho.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="empresa" className={label}>Empresa</label>
          <input id="empresa" name="empresa" autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="cargo" className={label}>Cargo</label>
          <input id="cargo" name="cargo" autoComplete="off" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="notas" className={label}>Notas</label>
        <textarea id="notas" name="notas" rows={3} className={`${input} py-2`} placeholder="Dónde os conocisteis, de qué hablasteis…" />
      </div>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={btn.secondary} onClick={() => router.back()}>
          Cancelar
        </button>
        <button type="submit" className={btn.primary} disabled={pending}>
          {pending ? "Guardando…" : "Guardar contacto"}
        </button>
      </div>
    </form>
  );
}
