"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { btn, input, label } from "@/components/ui/styles";

import { anadirInvitado, excluirInvitado, respuestaManual } from "../actions";
import { ETIQUETA_RESPUESTA, type Invitado } from "../types";
import { aCsv, descargar, fechaHora } from "./comun";

const TONO: Record<string, "green" | "red" | "gold" | "muted"> = { si: "green", no: "red", quizas: "gold", sin_respuesta: "muted" };

export function TablaInvitados({ eventoId, invitados, bajas }: { eventoId: string; invitados: Invitado[]; bajas: string[] }) {
  const router = useRouter();
  const deBaja = useMemo(() => new Set(bajas), [bajas]);
  const [q, setQ] = useState("");
  const [resp, setResp] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [ficha, setFicha] = useState<Invitado | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const etiquetas = useMemo(() => [...new Set(invitados.flatMap((i) => i.etiquetas))].sort(), [invitados]);
  const filtrados = invitados.filter((i) => {
    if (resp && (i.respuesta ?? "sin_respuesta") !== resp) return false;
    if (etiqueta && !i.etiquetas.includes(etiqueta)) return false;
    if (q) {
      const t = q.toLowerCase();
      if (![i.email, i.nombre, i.empresa].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
    }
    return true;
  });

  function accion(fn: () => Promise<{ ok: boolean; error?: string }>, cerrar = true) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Error");
      if (cerrar) {
        setFicha(null);
        setNuevo(false);
      }
      router.refresh();
    });
  }

  function exportar() {
    descargar(
      "invitados.csv",
      aCsv(
        ["Email", "Nombre", "Empresa", "Etiquetas", "Origen", "Respuesta", "Acompañante", "Nombre acompañante", "Teléfono", "Comentario", "Respondió", "Visitas", "Estado"],
        filtrados.map((i) => [
          i.email,
          i.nombre,
          i.empresa,
          i.etiquetas.join(", "),
          i.origen,
          ETIQUETA_RESPUESTA[i.respuesta ?? "sin_respuesta"],
          i.acompanante ? "Sí" : "No",
          i.acompanante_nombre,
          i.telefono_rsvp ?? i.telefono,
          i.comentario,
          i.respondido_en ? fechaHora(i.respondido_en) : "",
          i.n_visitas,
          deBaja.has(i.email) ? "Baja" : i.rebotado_en ? "Rebotado" : i.excluido ? "Excluido" : "",
        ]),
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className={label}>Buscar</label>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, email o empresa" />
        </div>
        <div>
          <label className={label}>Respuesta</label>
          <select className={input} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ETIQUETA_RESPUESTA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Etiqueta</label>
          <select className={input} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
            <option value="">Todas</option>
            {etiquetas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <button type="button" className={btn.secondary} onClick={exportar}>Exportar CSV</button>
        <button type="button" className={btn.secondary} onClick={() => setNuevo(true)}>Añadir a mano</button>
      </div>
      <p className="text-sm text-text-muted">{filtrados.length} de {invitados.length}</p>
      <div className="overflow-x-auto rounded-lg border border-subtle/60 bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-page text-left text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2">Invitado</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Etiquetas</th>
              <th className="px-3 py-2">Respuesta</th>
              <th className="px-3 py-2">Visitas</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, 1000).map((i) => (
              <tr key={i.id} className="cursor-pointer border-t border-subtle/50 hover:bg-page" onClick={() => setFicha(i)}>
                <td className="px-3 py-2">
                  <p className="font-medium text-text-primary">{i.nombre ?? "—"}</p>
                  <p className="text-xs text-text-muted">{i.email}</p>
                </td>
                <td className="px-3 py-2">{i.empresa ?? ""}</td>
                <td className="px-3 py-2 text-xs">{i.etiquetas.join(", ")}</td>
                <td className="px-3 py-2">
                  <Badge tone={TONO[i.respuesta ?? "sin_respuesta"]}>{ETIQUETA_RESPUESTA[i.respuesta ?? "sin_respuesta"]}</Badge>
                  {i.acompanante ? <span className="ml-1 text-xs text-text-muted">+1</span> : null}
                </td>
                <td className="px-3 py-2">{i.n_visitas}</td>
                <td className="px-3 py-2">
                  {deBaja.has(i.email) ? <Badge tone="red">Baja</Badge> : i.rebotado_en ? <Badge tone="red">Rebotado</Badge> : i.excluido ? <Badge tone="muted">Excluido</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length > 1000 ? <p className="p-3 text-sm text-text-muted">Se muestran 1000: usa los filtros o exporta.</p> : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Modal open={ficha !== null} title={ficha?.nombre ?? ficha?.email ?? ""} subtitle={ficha?.email} onClose={() => setFicha(null)} busy={pendiente} width="lg">
        {ficha ? <Ficha invitado={ficha} deBaja={deBaja.has(ficha.email)} pendiente={pendiente} error={error} onAccion={accion} eventoId={eventoId} /> : null}
      </Modal>

      <Modal open={nuevo} title="Añadir invitado" onClose={() => setNuevo(false)} busy={pendiente}>
        <form action={(f) => accion(() => anadirInvitado(eventoId, f))} className="space-y-3">
          <input name="email" type="email" required className={input} placeholder="email@empresa.com" />
          <input name="nombre" className={input} placeholder="Nombre y apellidos" />
          <input name="empresa" className={input} placeholder="Empresa" />
          <input name="telefono" className={input} placeholder="Teléfono" />
          <input name="etiquetas" className={input} placeholder="Etiquetas (separadas por comas)" />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button className={btn.primary} disabled={pendiente}>Añadir</button>
        </form>
      </Modal>
    </div>
  );
}

function Ficha({
  invitado: i,
  deBaja,
  pendiente,
  error,
  onAccion,
  eventoId,
}: {
  invitado: Invitado;
  deBaja: boolean;
  pendiente: boolean;
  error: string | null;
  onAccion: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  eventoId: string;
}) {
  const [r, setR] = useState<"si" | "no" | "quizas">(i.respuesta ?? "si");
  const [acomp, setAcomp] = useState(i.acompanante);
  const [nombreAcomp, setNombreAcomp] = useState(i.acompanante_nombre ?? "");
  const [comentario, setComentario] = useState(i.comentario ?? "");
  const [motivo, setMotivo] = useState("");
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-2">
        <dt className="text-text-muted">Empresa</dt><dd>{i.empresa ?? "—"}</dd>
        <dt className="text-text-muted">Origen</dt><dd>{i.origen ?? "—"}</dd>
        <dt className="text-text-muted">Respuesta</dt><dd>{ETIQUETA_RESPUESTA[i.respuesta ?? "sin_respuesta"]} {i.respondido_en ? `(${fechaHora(i.respondido_en)})` : ""}</dd>
        <dt className="text-text-muted">Acompañante</dt><dd>{i.acompanante ? i.acompanante_nombre || "Sí" : "No"}</dd>
        <dt className="text-text-muted">Teléfono</dt><dd>{i.telefono_rsvp ?? i.telefono ?? "—"}</dd>
        <dt className="text-text-muted">Comentario</dt><dd>{i.comentario ?? "—"}</dd>
        <dt className="text-text-muted">Visitas a la página</dt><dd>{i.n_visitas} {i.ultima_visita ? `(última ${fechaHora(i.ultima_visita)})` : ""}</dd>
        <dt className="text-text-muted">Estado</dt><dd>{deBaja ? "Dado de baja" : i.rebotado_en ? `Rebotado: ${i.rebote_motivo ?? ""}` : i.excluido ? `Excluido: ${i.excluido_motivo ?? ""}` : "Activo"}</dd>
      </dl>

      <fieldset className="space-y-2 rounded-md border border-subtle p-3">
        <legend className="px-1 text-xs uppercase tracking-wider text-text-muted">Registrar respuesta a mano</legend>
        <div className="flex gap-3">
          {(["si", "quizas", "no"] as const).map((v) => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" checked={r === v} onChange={() => setR(v)} /> {ETIQUETA_RESPUESTA[v]}
            </label>
          ))}
        </div>
        {r !== "no" ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={acomp} onChange={(e) => setAcomp(e.target.checked)} /> Acompañante</label>
            {acomp ? <input className={input} value={nombreAcomp} onChange={(e) => setNombreAcomp(e.target.value)} placeholder="Nombre del acompañante" /> : null}
          </div>
        ) : null}
        <input className={input} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario" />
        <button
          type="button"
          className={btn.primary}
          disabled={pendiente}
          onClick={() => onAccion(() => respuestaManual(eventoId, i.id, { respuesta: r, acompanante: acomp, acompanante_nombre: nombreAcomp, comentario }))}
        >
          Guardar respuesta
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {i.excluido ? (
          <button type="button" className={btn.secondary} disabled={pendiente} onClick={() => onAccion(() => excluirInvitado(eventoId, i.id, false, ""))}>
            Volver a incluir
          </button>
        ) : (
          <>
            <input className={`${input} max-w-xs`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la exclusión" />
            <button type="button" className={btn.danger} disabled={pendiente} onClick={() => onAccion(() => excluirInvitado(eventoId, i.id, true, motivo))}>
              Excluir de los envíos
            </button>
          </>
        )}
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
    </div>
  );
}
