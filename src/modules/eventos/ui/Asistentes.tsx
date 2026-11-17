"use client";

import { btn, card } from "@/components/ui/styles";

import { ETIQUETA_RESPUESTA, type Invitado } from "../types";
import { aCsv, descargar, fechaHora } from "./comun";

/** Lista interna de confirmados (y quizás) con acompañantes, para la puerta. */
export function Asistentes({ invitados, aforo, nombresResponsables }: { invitados: Invitado[]; aforo: number | null; nombresResponsables: Record<string, string> }) {
  const si = invitados.filter((i) => i.respuesta === "si");
  const quizas = invitados.filter((i) => i.respuesta === "quizas");
  const personas = (l: Invitado[]) => l.length + l.filter((i) => i.acompanante).length;

  function exportar(lista: Invitado[], nombre: string) {
    const filas: (string | null)[][] = [];
    for (const i of [...lista].sort((a, b) => (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email, "es"))) {
      filas.push([i.nombre, i.empresa, i.email, i.telefono_rsvp ?? i.telefono, ETIQUETA_RESPUESTA[i.respuesta ?? "sin_respuesta"]!, "Invitado", i.comentario, i.responsable_id ? (nombresResponsables[i.responsable_id] ?? "") : "", fechaHora(i.respondido_en)]);
      if (i.acompanante) filas.push([i.acompanante_nombre || `Acompañante de ${i.nombre ?? i.email}`, "", "", "", ETIQUETA_RESPUESTA[i.respuesta ?? "sin_respuesta"]!, `Acompañante de ${i.nombre ?? i.email}`, "", "", ""]);
    }
    descargar(nombre, aCsv(["Nombre", "Empresa", "Email", "Teléfono", "Respuesta", "Tipo", "Comentario", "Responsable Impar", "Respondió"], filas));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra t="Confirmados" v={si.length} />
        <Cifra t="Con acompañante" v={si.filter((i) => i.acompanante).length} />
        <Cifra t="Personas (sí)" v={personas(si)} sub={aforo ? `de ${aforo} de aforo` : undefined} alerta={aforo !== null && personas(si) > aforo} />
        <Cifra t="Quizás (personas)" v={personas(quizas)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.primary} onClick={() => exportar(si, "asistentes-confirmados.csv")}>Exportar confirmados (lista de puerta)</button>
        <button type="button" className={btn.secondary} onClick={() => exportar([...si, ...quizas], "asistentes-si-y-quizas.csv")}>Exportar sí + quizás</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-subtle/60 bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-page text-left text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2">Invitado</th>
              <th className="px-3 py-2">Acompañante</th>
              <th className="px-3 py-2">Teléfono</th>
              <th className="px-3 py-2">Comentario</th>
              <th className="px-3 py-2">Respondió</th>
            </tr>
          </thead>
          <tbody>
            {[...si, ...quizas].map((i) => (
              <tr key={i.id} className="border-t border-subtle/50">
                <td className="px-3 py-2">
                  <p className="font-medium text-text-primary">{i.nombre ?? i.email} {i.respuesta === "quizas" ? <span className="text-xs text-amber-700">(quizás)</span> : null}</p>
                  <p className="text-xs text-text-muted">{i.empresa}</p>
                </td>
                <td className="px-3 py-2">{i.acompanante ? i.acompanante_nombre || "Sí (sin nombre)" : "—"}</td>
                <td className="px-3 py-2">{i.telefono_rsvp ?? i.telefono ?? ""}</td>
                <td className="px-3 py-2 text-xs">{i.comentario}</td>
                <td className="px-3 py-2 text-xs">{fechaHora(i.respondido_en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cifra({ t, v, sub, alerta }: { t: string; v: number; sub?: string; alerta?: boolean }) {
  return (
    <div className={`${card} p-3`}>
      <p className="text-xs uppercase tracking-wider text-text-muted">{t}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-red-700" : "text-text-primary"}`}>{v}</p>
      {sub ? <p className="text-xs text-text-muted">{sub}</p> : null}
    </div>
  );
}
