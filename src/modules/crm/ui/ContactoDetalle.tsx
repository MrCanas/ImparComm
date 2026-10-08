"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { btn, card, input, label } from "@/components/ui/styles";
import {
  actualizarPersona,
  cambiarEstado,
  crearEtiqueta,
  guardarNotas,
  ponerEtiqueta,
  quitarEtiqueta,
  recuperar,
} from "@/modules/crm/actions";
import type { Etiqueta, EstadoRelacion, Persona } from "@/modules/crm/types";
import { TagPicker } from "@/modules/crm/ui/TagPicker";

export function TagsEditor({
  personaId,
  relacionId,
  estado,
  actuales,
  todas,
}: {
  personaId: string;
  relacionId: string;
  estado: EstadoRelacion;
  actuales: Etiqueta[];
  todas: Etiqueta[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(actuales);
  const [catalogo, setCatalogo] = useState(todas);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function add(e: Etiqueta) {
    setError("");
    setSelected((s) => (s.some((x) => x.id === e.id) ? s : [...s, e]));
    startTransition(async () => {
      const res = await ponerEtiqueta(personaId, e.id);
      if (!res.ok) {
        setError(res.error);
        setSelected((s) => s.filter((x) => x.id !== e.id));
        return;
      }
      // Etiquetar desde la ficha a alguien «nuevo» lo clasifica (y suma el punto).
      if (estado === "nueva") await cambiarEstado(relacionId, "clasificada");
      router.refresh();
    });
  }

  function remove(e: Etiqueta) {
    setError("");
    setSelected((s) => s.filter((x) => x.id !== e.id));
    startTransition(async () => {
      const res = await quitarEtiqueta(personaId, e.id);
      if (!res.ok) {
        setError(res.error);
        setSelected((s) => [...s, e]);
      }
      router.refresh();
    });
  }

  async function create(nombre: string, tipo: Etiqueta["tipo"]) {
    const res = await crearEtiqueta(nombre, tipo);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setCatalogo((c) => (c.some((x) => x.id === res.data!.id) ? c : [...c, res.data!]));
    return res.data!;
  }

  return (
    <>
      <TagPicker selected={selected} all={catalogo} onAdd={add} onRemove={remove} onCreate={create} disabled={pending} />
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </>
  );
}

export function NotasEditor({ relacionId, personaId, inicial }: { relacionId: string; personaId: string; inicial: string }) {
  const [notas, setNotas] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = notas !== guardado;

  return (
    <div className="space-y-2">
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        rows={5}
        className={`${input} py-2`}
        placeholder="Solo las ves tú."
      />
      <div className="flex items-center justify-end gap-3">
        {msg ? <span className="text-xs text-text-muted">{msg}</span> : null}
        <button
          type="button"
          disabled={!dirty || pending}
          className={btn.secondary}
          onClick={() =>
            startTransition(async () => {
              const res = await guardarNotas(relacionId, personaId, notas);
              if (res.ok) {
                setGuardado(notas);
                setMsg("Guardado");
              } else setMsg(res.error);
            })
          }
        >
          {pending ? "Guardando…" : "Guardar notas"}
        </button>
      </div>
    </div>
  );
}

export function ContactoAcciones({
  relacionId,
  estado,
  tieneEtiquetas,
}: {
  relacionId: string;
  estado: EstadoRelacion;
  tieneEtiquetas: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <section className={`${card} p-4`}>
      {estado === "archivada" ? (
        <>
          <p className="mb-3 text-sm text-text-muted">Este contacto está archivado. Puedes recuperarlo cuando quieras.</p>
          <button type="button" className={`${btn.primary} w-full`} disabled={pending} onClick={() => run(() => recuperar(relacionId, tieneEtiquetas))}>
            <Icon name="undo" className="h-4 w-4" /> Recuperar contacto
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-muted">¿No es relevante? Archívalo: deja de aparecer, pero se puede recuperar.</p>
          <button type="button" className={`${btn.danger} w-full`} disabled={pending} onClick={() => run(() => cambiarEstado(relacionId, "archivada"))}>
            <Icon name="archive" className="h-4 w-4" /> Archivar
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

export function EditarPersona({ persona }: { persona: Persona }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const res = await actualizarPersona(persona.id, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={`${btn.secondary} shrink-0 px-3`} onClick={() => setOpen(true)}>
        Editar
      </button>
      <Modal
        open={open}
        title="Editar contacto"
        subtitle="Los datos de la persona son de Impar y los ven todos los que la conocen."
        busy={pending}
        onClose={() => setOpen(false)}
        elevated
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </button>
            <button type="submit" form="editar-persona" className={btn.primary} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
      >
        <form id="editar-persona" action={onSubmit} className="space-y-4">
          <div>
            <label className={label} htmlFor="ep-nombre">Nombre</label>
            <input id="ep-nombre" name="nombre" defaultValue={persona.nombre} required className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ep-email">Email</label>
              <input id="ep-email" name="email" type="email" defaultValue={persona.email ?? ""} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="ep-tel">Teléfono</label>
              <input id="ep-tel" name="telefono" type="tel" defaultValue={persona.telefono ?? ""} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="ep-empresa">Empresa</label>
              <input id="ep-empresa" name="empresa" defaultValue={persona.empresa?.nombre ?? ""} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="ep-cargo">Cargo</label>
              <input id="ep-cargo" name="cargo" defaultValue={persona.cargo ?? ""} className={input} />
            </div>
          </div>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </form>
      </Modal>
    </>
  );
}
