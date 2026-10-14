"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card, input, label } from "@/components/ui/styles";
import { fmtFecha } from "@/lib/format";
import {
  crearHito,
  eliminarHito,
  incluirEnHito,
  marcarContactado,
  quitarDeHito,
  reintentarZoho,
  volverAPendiente,
} from "@/modules/crm/actions";
import { CANALES, TIPOS_HITO, type Etiqueta, type HitoPersona, type Persona } from "@/modules/crm/types";

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

type Miembro = HitoPersona & { contactadoPorNombre: string | null };

export function HitoDetalle({
  hitoId,
  miembros,
  candidatos,
  puedeEliminar,
}: {
  hitoId: string;
  miembros: Miembro[];
  candidatos: Persona[];
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [verCandidatos, setVerCandidatos] = useState(miembros.length === 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const pendientes = miembros.filter((m) => m.estado === "pte");
  const contactados = miembros.filter((m) => m.estado === "contactado");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { n: miembros.length, t: "Invitados" },
          { n: pendientes.length, t: "Pendientes" },
          { n: contactados.length, t: "Contactados" },
        ].map((k) => (
          <div key={k.t} className={`${card} p-3`}>
            <p className="text-2xl font-semibold text-text-primary">{k.n}</p>
            <p className="text-xs text-text-muted">{k.t}</p>
          </div>
        ))}
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section>
        <SectionTitle
          aside={
            <button type="button" className="text-sm font-medium text-icam-900 min-h-11 lg:min-h-0" onClick={() => setVerCandidatos((v) => !v)}>
              {verCandidatos ? "Ocultar candidatos" : `Añadir candidatos (${candidatos.length})`}
            </button>
          }
        >
          Mis invitados
        </SectionTitle>

        {verCandidatos ? (
          <div className={`${card} mb-3 p-3`}>
            {candidatos.length === 0 ? (
              <p className="text-sm text-text-muted">
                No tienes más contactos clasificados con estas etiquetas. Clasifica en el{" "}
                <Link href="/ritual" className="font-medium text-icam-900 underline">ritual</Link>.
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-text-muted">{candidatos.length} candidato{candidatos.length === 1 ? "" : "s"} de tus contactos</p>
                  <button
                    type="button"
                    className={`${btn.secondary} min-h-9 px-3`}
                    disabled={pending}
                    onClick={() => run(() => incluirEnHito(hitoId, candidatos.map((c) => c.id)))}
                  >
                    Añadir todos
                  </button>
                </div>
                <ul className="divide-y divide-subtle/60">
                  {candidatos.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.nombre}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {c.empresa?.nombre ?? c.email ?? c.telefono}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Añadir a ${c.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle hover:border-icam-900"
                        disabled={pending}
                        onClick={() => run(() => incluirEnHito(hitoId, [c.id]))}
                      >
                        <Icon name="plus" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {miembros.length === 0 ? (
          <EmptyState title="Aún no has invitado a nadie">Añade candidatos de tus contactos a este hito.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {[...pendientes, ...contactados].map((m) => (
              <MiembroRow key={m.persona_id} hitoId={hitoId} m={m} pending={pending} run={run} />
            ))}
          </ul>
        )}
      </section>

      {puedeEliminar ? (
        <div className="border-t border-subtle pt-4">
          <button
            type="button"
            className={btn.danger}
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Eliminar este hito y su lista de invitados?")) {
                run(() => eliminarHito(hitoId), () => router.push("/hitos"));
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

function MiembroRow({
  hitoId,
  m,
  pending,
  run,
}: {
  hitoId: string;
  m: Miembro;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [canal, setCanal] = useState<string>(CANALES[0]);
  const contactado = m.estado === "contactado";

  return (
    <li className={`${card} p-3`}>
      <div className="flex items-start gap-3">
        <Link href={`/contactos/${m.persona.id}`} className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text-primary hover:underline">{m.persona.nombre}</span>
          <span className="block truncate text-xs text-text-muted">
            {[m.persona.cargo, m.persona.empresa?.nombre].filter(Boolean).join(" · ") || m.persona.email}
          </span>
        </Link>
        <Badge tone={contactado ? "green" : "gold"}>{contactado ? "Contactado" : "Pte"}</Badge>
      </div>

      {contactado ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            Contactado por {m.contactadoPorNombre}, {fmtFecha(m.fecha_contacto)}
            {m.canal ? ` · ${m.canal}` : ""}
            {m.zoho_estado === "ok" ? " · En Zoho" : ""}
          </p>
          {m.zoho_estado === "error" ? (
            <span className="flex w-full items-center justify-between gap-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
              <span className="truncate" title={m.zoho_error ?? undefined}>No se pudo pasar a Zoho</span>
              <button type="button" className="min-h-9 shrink-0 font-medium underline" disabled={pending} onClick={() => run(() => reintentarZoho(hitoId, m.persona_id))}>
                Reintentar
              </button>
            </span>
          ) : null}
          <button type="button" className="min-h-9 text-xs font-medium text-text-muted underline" disabled={pending} onClick={() => run(() => volverAPendiente(hitoId, m.persona_id))}>
            Volver a Pte
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className={`${input} min-h-10 w-auto flex-1 sm:flex-none`} aria-label="Canal">
            {CANALES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            className={`${btn.primary} min-h-10 flex-1 sm:flex-none`}
            disabled={pending}
            onClick={() => run(() => marcarContactado(hitoId, m.persona_id, canal))}
          >
            <Icon name="check" className="h-4 w-4" /> Contactado
          </button>
          <button
            type="button"
            aria-label="Quitar del hito"
            className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted hover:bg-page"
            disabled={pending}
            onClick={() => run(() => quitarDeHito(hitoId, m.persona_id))}
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}
