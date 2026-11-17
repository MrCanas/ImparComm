"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import { CAMPOS, parsearCsv, proponerMapeo, type Campo } from "@/lib/eventos/importar";

import { confirmarImportacion, previsualizarImportacion, type ResumenImportacion } from "../actions";

export function Importador({ eventoId }: { eventoId: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [tieneCabecera, setTieneCabecera] = useState(true);
  const [mapeo, setMapeo] = useState<Partial<Record<Campo, number>>>({});
  const [origen, setOrigen] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const filas = useMemo(() => (csv.trim() ? parsearCsv(csv) : []), [csv]);
  const cabecera = filas[0] ?? [];

  function cargar(texto: string) {
    setCsv(texto);
    setResumen(null);
    setHecho(null);
    const f = parsearCsv(texto);
    if (f[0]) setMapeo(proponerMapeo(f[0]));
  }

  async function leerArchivo(file: File) {
    const buf = await file.arrayBuffer();
    // Excel en español suele guardar CSV en Windows-1252: si no es UTF-8 válido, se reintenta.
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buf);
    }
    cargar(texto);
  }

  const entrada = { csv, mapeo, tieneCabecera, origen, etiquetas };

  function analizar() {
    setError(null);
    setHecho(null);
    start(async () => {
      const r = await previsualizarImportacion(eventoId, entrada);
      if (!r.ok) return setError(r.error);
      setResumen(r.data!);
    });
  }

  function confirmar() {
    setError(null);
    start(async () => {
      const r = await confirmarImportacion(eventoId, entrada);
      if (!r.ok) return setError(r.error);
      setHecho(`${r.data!.insertados} invitados añadidos.`);
      setResumen(null);
      setCsv("");
      router.refresh();
    });
  }

  return (
    <div className={`${card} space-y-4 p-4`}>
      <div>
        <p className="font-medium text-text-primary">Importar invitados</p>
        <p className="text-sm text-text-muted">
          Sube un CSV (exportado de Zoho o de Excel como «CSV UTF-8») o pega las celdas copiadas de Excel. Nada se guarda hasta que pulses «Confirmar carga».
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])} className="text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tieneCabecera} onChange={(e) => setTieneCabecera(e.target.checked)} className="h-4 w-4" />
          La primera fila es la cabecera
        </label>
      </div>
      <textarea value={csv} onChange={(e) => cargar(e.target.value)} rows={5} className={`${input} py-2 font-mono text-xs`} placeholder="…o pega aquí las celdas de Excel" />

      {filas.length ? (
        <>
          <p className="text-sm text-text-muted">{filas.length - (tieneCabecera ? 1 : 0)} filas detectadas. Indica qué columna es cada dato:</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CAMPOS.map((c) => (
              <div key={c.campo}>
                <label className={label}>{c.etiqueta}{c.campo === "email" ? " *" : ""}</label>
                <select
                  className={input}
                  value={mapeo[c.campo] ?? ""}
                  onChange={(e) => setMapeo((m) => ({ ...m, [c.campo]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">—</option>
                  {cabecera.map((h, i) => (
                    <option key={i} value={i}>{tieneCabecera ? h || `Columna ${i + 1}` : `Columna ${i + 1} (${h})`}</option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label className={label}>Origen (si no viene en el fichero)</label>
              <input className={input} value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="Zoho, Excel socios…" />
            </div>
            <div>
              <label className={label}>Etiquetas para todos (separadas por comas)</label>
              <input className={input} value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="Navidad 2026" />
            </div>
          </div>
          <button type="button" className={btn.secondary} onClick={analizar} disabled={pendiente || mapeo.email === undefined}>
            {pendiente && !resumen ? "Analizando (incluye comprobar los dominios)…" : "Analizar"}
          </button>
        </>
      ) : null}

      {resumen ? (
        <div className="space-y-3 rounded-md bg-page p-3 text-sm">
          <p className="font-medium text-text-primary">Informe previo (aún no se ha guardado nada)</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>Filas leídas: <strong>{resumen.totalFilas}</strong></li>
            <li className="text-emerald-700">Se añadirán: <strong>{resumen.nuevos}</strong></li>
            <li>Ya estaban en el evento: <strong>{resumen.yaEnEvento}</strong></li>
            <li>Duplicados dentro del fichero (se ignoran): <strong>{resumen.duplicados.length}</strong></li>
            <li className={resumen.invalidos.length ? "text-red-700" : ""}>Emails no válidos (se descartan): <strong>{resumen.invalidos.length}</strong></li>
            <li className={resumen.sinMx.length ? "text-red-700" : ""}>Dominios que no reciben correo (se descartan): <strong>{resumen.sinMx.length}</strong></li>
            <li className={resumen.deBaja.length ? "text-amber-700" : ""}>Dados de baja (se importan, pero no recibirán nada): <strong>{resumen.deBaja.length}</strong></li>
            <li className={resumen.genericos.length ? "text-amber-700" : ""}>Direcciones genéricas (info@…): <strong>{resumen.genericos.length}</strong></li>
          </ul>
          {resumen.responsablesDesconocidos.length ? (
            <p className="text-amber-700">Responsables que no son usuarios de ImparComm (quedarán sin responsable): {resumen.responsablesDesconocidos.join(", ")}</p>
          ) : null}
          <Detalle titulo="Emails no válidos" filas={resumen.invalidos.map((i) => `Línea ${i.linea}: ${i.valor || "(vacío)"} — ${i.motivo}`)} />
          <Detalle titulo="Dominios sin correo" filas={resumen.sinMx.map((s) => s.email)} />
          <Detalle titulo="Duplicados" filas={resumen.duplicados.map((d) => `Línea ${d.linea}: ${d.email} (ya en la línea ${d.primeraLinea})`)} />
          <Detalle titulo="Genéricos" filas={resumen.genericos} />
          <Detalle titulo="Muestra de lo que se importará" filas={resumen.muestra.map((m) => `${m.email} · ${m.nombre ?? "sin nombre"} · ${m.empresa ?? ""} ${m.etiquetas.length ? `[${m.etiquetas.join(", ")}]` : ""}`)} />
          <button type="button" className={btn.primary} onClick={confirmar} disabled={pendiente || resumen.nuevos === 0}>
            {pendiente ? "Guardando…" : `Confirmar carga de ${resumen.nuevos} invitados`}
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {hecho ? <p className="text-sm text-emerald-700">{hecho}</p> : null}
    </div>
  );
}

function Detalle({ titulo, filas }: { titulo: string; filas: string[] }) {
  if (!filas.length) return null;
  return (
    <details>
      <summary className="cursor-pointer text-text-primary">{titulo} ({filas.length})</summary>
      <ul className="mt-1 max-h-48 overflow-auto font-mono text-xs text-text-muted">
        {filas.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </details>
  );
}
