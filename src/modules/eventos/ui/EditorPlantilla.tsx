"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import type { Bloque } from "@/lib/eventos/render/tipos";
import type { Revision } from "@/lib/eventos/render/validar";
import { VARIABLES } from "@/lib/eventos/render/variables";

import { enviarPruebaPlantilla, guardarPlantilla, previsualizarPlantilla, restaurarVersion, subirImagen, type ContenidoEditable } from "../actions";
import { TIPOS_PLANTILLA, type Plantilla } from "../types";
import { fechaHora } from "./comun";

const NUEVOS: { tipo: Bloque["tipo"]; etiqueta: string; crear: () => Bloque }[] = [
  { tipo: "imagen", etiqueta: "Imagen", crear: () => ({ tipo: "imagen", src: "", alt: "" }) },
  { tipo: "titulo", etiqueta: "Título (Baskerville)", crear: () => ({ tipo: "titulo", texto: "Título" }) },
  { tipo: "texto", etiqueta: "Texto (Lato)", crear: () => ({ tipo: "texto", texto: "" }) },
  { tipo: "ficha_evento", etiqueta: "Ficha del evento", crear: () => ({ tipo: "ficha_evento" }) },
  { tipo: "botones_rsvp", etiqueta: "Botones Sí / Quizás / No", crear: () => ({ tipo: "botones_rsvp", si: "Asistiré", quizas: "Quizás", no: "No podré" }) },
  { tipo: "boton", etiqueta: "Botón", crear: () => ({ tipo: "boton", texto: "Responder", destino: "respuesta" }) },
  { tipo: "separador", etiqueta: "Separador", crear: () => ({ tipo: "separador" }) },
  { tipo: "espacio", etiqueta: "Espacio", crear: () => ({ tipo: "espacio", alto: 20 }) },
  { tipo: "pie", etiqueta: "Pie legal", crear: () => ({ tipo: "pie", texto: "" }) },
];

export function EditorPlantilla({
  eventoId,
  plantilla,
  invitados,
  versiones,
}: {
  eventoId: string;
  plantilla: Plantilla;
  invitados: { id: string; email: string; nombre: string | null }[];
  versiones: { version: number; created_at: string }[];
}) {
  const router = useRouter();
  const [c, setC] = useState<ContenidoEditable>({
    nombre: plantilla.nombre,
    asunto: plantilla.asunto,
    preheader: plantilla.preheader,
    modo: plantilla.modo,
    bloques: plantilla.bloques,
    html: plantilla.html,
    adjuntar_ics: plantilla.adjuntar_ics,
  });
  const [invitadoId, setInvitadoId] = useState<string>("");
  const [vista, setVista] = useState<{ asunto: string; html: string; texto: string; kb: number; revision: Revision } | null>(null);
  const [movil, setMovil] = useState(false);
  const [verTexto, setVerTexto] = useState(false);
  const [destino, setDestino] = useState("impar-prueba@yopmail.com");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [version, setVersion] = useState(plantilla.version);
  const [sucio, setSucio] = useState(false);
  const [pendiente, start] = useTransition();
  const [, startVista] = useTransition();

  const cambiar = (p: Partial<ContenidoEditable>) => {
    setC((x) => ({ ...x, ...p }));
    setSucio(true);
  };
  const setBloque = (i: number, b: Partial<Bloque>) => cambiar({ bloques: c.bloques.map((x, j) => (j === i ? ({ ...x, ...b } as Bloque) : x)) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= c.bloques.length) return;
    const nb = [...c.bloques];
    [nb[i], nb[j]] = [nb[j]!, nb[i]!];
    cambiar({ bloques: nb });
  };

  const clave = JSON.stringify([c, invitadoId]);
  useEffect(() => {
    const t = setTimeout(() => {
      startVista(async () => {
        const r = await previsualizarPlantilla(eventoId, JSON.parse(clave)[0], plantilla.tipo, JSON.parse(clave)[1] || null);
        if (r.ok) setVista(r.data!);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [clave, eventoId, plantilla.tipo]);

  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  function guardar() {
    setMensaje(null);
    start(async () => {
      const r = await guardarPlantilla(plantilla.id, c);
      if (!r.ok) return setMensaje({ ok: false, texto: r.error });
      if (r.data!.revision.errores.length) return setMensaje({ ok: false, texto: `No se ha guardado: ${r.data!.revision.errores.join(" ")}` });
      setVersion(r.data!.version);
      setSucio(false);
      setMensaje({ ok: true, texto: `Guardado (versión ${r.data!.version}). Los envíos en pausa usarán esta versión al reanudar.` });
      router.refresh();
    });
  }

  function probar() {
    setMensaje(null);
    if (sucio) return setMensaje({ ok: false, texto: "Guarda los cambios antes de enviar la prueba (se envía la versión guardada)." });
    start(async () => {
      const r = await enviarPruebaPlantilla(plantilla.id, destino, invitadoId || null);
      setMensaje(r.ok ? { ok: true, texto: `${r.data!.detalle} Ábrelo en yopmail.com/?${destino.split("@")[0]}` } : { ok: false, texto: r.error });
    });
  }

  const rev = vista?.revision;
  const tipoEtiqueta = TIPOS_PLANTILLA.find((t) => t.tipo === plantilla.tipo)?.etiqueta;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className={`${card} space-y-3 p-4`}>
          <p className="text-xs uppercase tracking-wider text-text-muted">{tipoEtiqueta} · versión {version}{sucio ? " · cambios sin guardar" : ""}</p>
          <div>
            <label className={label} htmlFor="pl-nombre">Nombre interno</label>
            <input id="pl-nombre" className={input} value={c.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="pl-asunto">Asunto</label>
            <input id="pl-asunto" className={input} value={c.asunto} onChange={(e) => cambiar({ asunto: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="pl-preheader">Preheader (texto que se ve junto al asunto en la bandeja)</label>
            <input id="pl-preheader" className={input} value={c.preheader ?? ""} onChange={(e) => cambiar({ preheader: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.adjuntar_ics} onChange={(e) => cambiar({ adjuntar_ics: e.target.checked })} />
            Adjuntar invitación de calendario (para confirmaciones)
          </label>
          <div className="flex gap-2 text-sm">
            <button type="button" className={c.modo === "bloques" ? btn.primary : btn.secondary} onClick={() => cambiar({ modo: "bloques" })}>Bloques de marca</button>
            <button type="button" className={c.modo === "html" ? btn.primary : btn.secondary} onClick={() => cambiar({ modo: "html", html: c.html ?? "" })}>HTML propio</button>
          </div>
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer">Variables disponibles</summary>
            <p className="mt-1 font-mono">{VARIABLES.map((v) => `{{${v}}}`).join("  ")}</p>
            <p className="mt-1">Texto por defecto si falta el dato: <span className="font-mono">{"{{nombre|amigo/a}}"}</span>. En los textos: **negrita** y [texto](https://enlace).</p>
          </details>
        </div>

        {c.modo === "bloques" ? (
          <div className="space-y-2">
            {c.bloques.map((b, i) => (
              <div key={i} className={`${card} space-y-2 p-3`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{NUEVOS.find((n) => n.tipo === b.tipo)?.etiqueta}</span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" className={btn.ghost} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                    <button type="button" className={btn.ghost} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
                    <button type="button" className={btn.ghost} onClick={() => cambiar({ bloques: c.bloques.filter((_, j) => j !== i) })} aria-label="Quitar">✕</button>
                  </span>
                </div>
                <EditorBloque bloque={b} onChange={(p) => setBloque(i, p)} eventoId={eventoId} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {NUEVOS.map((n) => (
                <button key={n.tipo} type="button" className={btn.secondary} onClick={() => cambiar({ bloques: [...c.bloques, n.crear()] })}>+ {n.etiqueta}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${card} space-y-2 p-4`}>
            <label className={label}>HTML (pega el del diseñador; debe incluir {"{{enlace_respuesta}}"} y {"{{enlace_baja}}"})</label>
            <textarea className={`${input} min-h-96 py-2 font-mono text-xs`} value={c.html ?? ""} onChange={(e) => cambiar({ html: e.target.value })} spellCheck={false} />
            <SubirImagen eventoId={eventoId} onUrl={(url) => navigator.clipboard?.writeText(url)} texto="Subir imagen (la URL se copia al portapapeles)" />
          </div>
        )}

        <div className={`${card} sticky bottom-20 space-y-2 p-4 lg:bottom-4`}>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={guardar} disabled={pendiente || !sucio}>{pendiente ? "…" : "Guardar"}</button>
            <input id="pl-destino" aria-label="Dirección de prueba (@yopmail.com)" className={`${input} max-w-60`} value={destino} onChange={(e) => setDestino(e.target.value)} />
            <button type="button" className={btn.secondary} onClick={probar} disabled={pendiente}>Enviar prueba</button>
          </div>
          {mensaje ? <p className={`text-sm ${mensaje.ok ? "text-emerald-700" : "text-red-700"}`}>{mensaje.texto}</p> : null}
        </div>

        {versiones.length > 1 ? (
          <details className={`${card} p-4 text-sm`}>
            <summary className="cursor-pointer font-medium">Versiones ({versiones.length})</summary>
            <ul className="mt-2 space-y-1">
              {versiones.map((v) => (
                <li key={v.version} className="flex items-center gap-2">
                  <span>v{v.version} · {fechaHora(v.created_at)}</span>
                  {v.version !== version ? (
                    <button
                      type="button"
                      className="ml-auto text-icam-900 underline"
                      onClick={() => {
                        if (!window.confirm(`¿Volver a la versión ${v.version}? Se guardará como una versión nueva.`)) return;
                        start(async () => {
                          const r = await restaurarVersion(plantilla.id, v.version);
                          if (!r.ok) return setMensaje({ ok: false, texto: r.error });
                          window.location.reload();
                        });
                      }}
                    >
                      Restaurar
                    </button>
                  ) : <span className="ml-auto text-text-muted">actual</span>}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        <div className={`${card} space-y-2 p-3`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className={`${input} max-w-72`} value={invitadoId} onChange={(e) => setInvitadoId(e.target.value)}>
              <option value="">Datos de ejemplo</option>
              {invitados.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre ?? i.email}</option>
              ))}
            </select>
            <button type="button" className={btn.ghost} onClick={() => setMovil((m) => !m)}>{movil ? "Escritorio" : "Móvil"}</button>
            <button type="button" className={btn.ghost} onClick={() => setVerTexto((m) => !m)}>{verTexto ? "HTML" : "Texto plano"}</button>
            {vista ? <span className="ml-auto text-xs text-text-muted">{vista.kb} KB</span> : null}
          </div>
          {vista ? <p className="text-sm"><span className="text-text-muted">Asunto:</span> <strong>{vista.asunto}</strong></p> : null}
          {rev && (rev.errores.length || rev.avisos.length) ? (
            <ul className="space-y-1 text-xs">
              {rev.errores.map((e) => <li key={e} className="text-red-700">✗ {e}</li>)}
              {rev.avisos.map((a) => <li key={a} className="text-amber-700">! {a}</li>)}
            </ul>
          ) : rev ? <p className="text-xs text-emerald-700">✓ Revisión sin problemas</p> : null}
        </div>
        {vista ? (
          verTexto ? (
            <pre className={`${card} max-h-[80vh] overflow-auto whitespace-pre-wrap p-4 text-xs`}>{vista.texto}</pre>
          ) : (
            <iframe
              title="Vista previa"
              sandbox=""
              srcDoc={vista.html}
              className="mx-auto block h-[80vh] rounded-lg border border-subtle bg-white"
              style={{ width: movil ? 375 : "100%" }}
            />
          )
        ) : <p className="text-sm text-text-muted">Generando vista previa…</p>}
        <p className="text-xs text-text-muted">
          La vista previa usa las fuentes de la marca. En Gmail y Outlook de escritorio, Baskerville y Lato se sustituyen por Georgia y Arial.
        </p>
      </div>
    </div>
  );
}

function EditorBloque({ bloque: b, onChange, eventoId }: { bloque: Bloque; onChange: (p: Partial<Bloque>) => void; eventoId: string }) {
  switch (b.tipo) {
    case "imagen":
      return (
        <div className="space-y-2">
          <input className={input} value={b.src} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://… (o sube una imagen)" />
          <SubirImagen eventoId={eventoId} onUrl={(url) => onChange({ src: url })} texto="Subir imagen" />
          <input className={input} value={b.alt} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Texto alternativo (se ve si el cliente bloquea imágenes)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={b.enlace === "respuesta"} onChange={(e) => onChange({ enlace: e.target.checked ? "respuesta" : "ninguno" })} />
            Al pulsar la imagen, ir a la página de respuesta
          </label>
        </div>
      );
    case "titulo":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input className={input} value={b.texto} onChange={(e) => onChange({ texto: e.target.value })} />
          <select className={input} value={b.nivel ?? 1} onChange={(e) => onChange({ nivel: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>Título</option>
            <option value={2}>Subtítulo</option>
          </select>
          <input type="number" min={12} max={60} className={`${input} w-24`} value={b.tamano ?? ""} onChange={(e) => onChange({ tamano: e.target.value ? Number(e.target.value) : undefined })} placeholder="px" title="Tamaño (vacío = el de la marca)" />
          <select className={input} value={b.color ?? "principal"} onChange={(e) => onChange({ color: e.target.value as "principal" | "acento" })}>
            <option value="principal">Navy</option>
            <option value="acento">Dorado</option>
          </select>
        </div>
      );
    case "texto":
      return (
        <div className="space-y-2">
          <textarea className={`${input} min-h-28 py-2`} value={b.texto} onChange={(e) => onChange({ texto: e.target.value })} />
          <div className="flex gap-2">
            <input type="number" min={11} max={24} className={`${input} w-24`} value={b.tamano ?? ""} onChange={(e) => onChange({ tamano: e.target.value ? Number(e.target.value) : undefined })} placeholder="px" title="Tamaño (vacío = el de la marca)" />
            <select className={input} value={b.alineacion ?? "left"} onChange={(e) => onChange({ alineacion: e.target.value as "left" | "center" | "right" })}>
              <option value="left">Izquierda</option>
              <option value="center">Centrado</option>
              <option value="right">Derecha</option>
            </select>
          </div>
        </div>
      );
    case "botones_rsvp":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={input} value={b.si} onChange={(e) => onChange({ si: e.target.value })} />
          <input className={input} value={b.quizas} onChange={(e) => onChange({ quizas: e.target.value })} />
          <input className={input} value={b.no} onChange={(e) => onChange({ no: e.target.value })} />
        </div>
      );
    case "boton":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={input} value={b.texto} onChange={(e) => onChange({ texto: e.target.value })} />
          <select className={input} value={b.destino} onChange={(e) => onChange({ destino: e.target.value as "respuesta" | "calendario" | "url" })}>
            <option value="respuesta">Página de respuesta</option>
            <option value="calendario">Añadir al calendario</option>
            <option value="url">Otra dirección</option>
          </select>
          {b.destino === "url" ? <input className={input} value={b.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://" /> : null}
        </div>
      );
    case "ficha_evento":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.mostrarMapa !== false} onChange={(e) => onChange({ mostrarMapa: e.target.checked })} />
          Mostrar enlace al mapa (fecha, hora, lugar y dirección salen de los datos del evento)
        </label>
      );
    case "espacio":
      return <input type="number" min={4} max={80} className={`${input} w-28`} value={b.alto} onChange={(e) => onChange({ alto: Number(e.target.value) })} />;
    case "pie":
      return (
        <div>
          <textarea className={`${input} min-h-20 py-2`} value={b.texto} onChange={(e) => onChange({ texto: e.target.value })} placeholder="Texto legal" />
          <p className="mt-1 text-xs text-text-muted">El enlace de baja se añade siempre debajo, automáticamente.</p>
        </div>
      );
    default:
      return null;
  }
}

function SubirImagen({ eventoId, onUrl, texto }: { eventoId: string; onUrl: (url: string) => void; texto: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("archivo", f);
          start(async () => {
            const r = await subirImagen(eventoId, fd);
            if (!r.ok) return setEstado(r.error);
            onUrl(r.data!.url);
            setEstado(`Subida (${Math.round(f.size / 1024)} KB)${f.size > 300 * 1024 ? " · pesa mucho para email: mejor < 300 KB" : ""}`);
          });
        }}
      />
      <button type="button" className={btn.secondary} onClick={() => ref.current?.click()} disabled={pendiente}>{pendiente ? "Subiendo…" : texto}</button>
      {estado ? <span className="text-xs text-text-muted">{estado}</span> : null}
    </div>
  );
}
