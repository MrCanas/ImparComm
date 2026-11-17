"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { btn, card, input, label } from "@/components/ui/styles";
import { FUENTE_CUERPO, FUENTE_TITULO, MARCA_POR_DEFECTO, type Marca } from "@/lib/eventos/render/tipos";

import { cambiarModoPrueba, guardarMarca } from "../actions";

const NUMEROS: { k: keyof Marca; t: string; min: number; max: number; step?: number }[] = [
  { k: "tituloTamano", t: "Título (px)", min: 14, max: 60 },
  { k: "subtituloTamano", t: "Subtítulo (px)", min: 12, max: 40 },
  { k: "cuerpoTamano", t: "Cuerpo (px)", min: 11, max: 24 },
  { k: "pieTamano", t: "Pie (px)", min: 9, max: 16 },
  { k: "interlineado", t: "Interlineado", min: 1, max: 2.2, step: 0.1 },
  { k: "tituloEspaciado", t: "Espaciado del título (px)", min: 0, max: 8, step: 0.5 },
  { k: "anchoMax", t: "Ancho del correo (px)", min: 480, max: 720 },
];
const COLORES: { k: keyof Marca; t: string }[] = [
  { k: "colorPrincipal", t: "Principal (navy)" },
  { k: "colorAcento", t: "Acento (dorado)" },
  { k: "colorTexto", t: "Texto" },
  { k: "colorFondo", t: "Fondo" },
  { k: "colorTarjeta", t: "Tarjeta" },
];

export function MarcaAjustes({ marca: inicial, modoPrueba, entornoReal }: { marca: Partial<Marca>; modoPrueba: boolean; entornoReal: boolean }) {
  const router = useRouter();
  const [m, setM] = useState<Marca>({ ...MARCA_POR_DEFECTO, ...inicial });
  const [conf, setConf] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: r.error ?? "Error" });
      if (r.ok) router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`${card} space-y-4 p-4`}>
        <p className="font-medium text-text-primary">Marca de los correos</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMEROS.map((n) => (
            <div key={n.k}>
              <label className={label}>{n.t}</label>
              <input type="number" min={n.min} max={n.max} step={n.step ?? 1} className={input} value={m[n.k] as number} onChange={(e) => setM({ ...m, [n.k]: Number(e.target.value) })} />
            </div>
          ))}
          {COLORES.map((c) => (
            <div key={c.k}>
              <label className={label}>{c.t}</label>
              <div className="flex gap-2">
                <input type="color" value={m[c.k] as string} onChange={(e) => setM({ ...m, [c.k]: e.target.value })} className="h-11 w-12 rounded border border-subtle" />
                <input className={input} value={m[c.k] as string} onChange={(e) => setM({ ...m, [c.k]: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn.primary} disabled={pendiente} onClick={() => run(() => guardarMarca(m), "Marca guardada. Se aplica a todas las plantillas de bloques.")}>Guardar marca</button>
          <button type="button" className={btn.ghost} onClick={() => setM(MARCA_POR_DEFECTO)}>Valores por defecto</button>
        </div>
      </div>

      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- solo esta vista previa necesita las fuentes del correo */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville&family=Lato:wght@400;700&display=swap" precedence="default" />
        <div className="rounded-lg border border-subtle p-6" style={{ background: m.colorFondo }}>
          <div className="mx-auto p-6" style={{ background: m.colorTarjeta, maxWidth: m.anchoMax }}>
            <p style={{ fontFamily: FUENTE_TITULO, fontSize: m.tituloTamano, letterSpacing: m.tituloEspaciado, color: m.colorPrincipal, textAlign: "center", textTransform: "uppercase", margin: 0 }}>
              CÓCTEL DE NAVIDAD
            </p>
            <p style={{ fontFamily: FUENTE_TITULO, fontSize: m.subtituloTamano, letterSpacing: m.tituloEspaciado, color: m.colorAcento, textAlign: "center", textTransform: "uppercase", margin: "12px 0" }}>
              IMPAR CAPITAL
            </p>
            <p style={{ fontFamily: FUENTE_CUERPO, fontSize: m.cuerpoTamano, lineHeight: m.interlineado, color: m.colorTexto }}>
              Querido/a Ana: nos encantaría contar contigo en nuestro cóctel de Navidad. ¿Nos confirmas tu asistencia?
            </p>
            <p style={{ fontFamily: FUENTE_CUERPO, fontSize: m.pieTamano, color: "#8A8A8A", textAlign: "center" }}>Impar Capital · Madrid · Darse de baja</p>
          </div>
        </div>

        <div className={`${card} space-y-3 p-4`}>
          <p className="font-medium text-text-primary">Modo de envío</p>
          {modoPrueba || !entornoReal ? (
            <>
              <p className="text-sm">
                <strong>Modo prueba activo:</strong> solo se envía a direcciones @yopmail.com.
              </p>
              {!entornoReal ? (
                <p className="text-sm text-text-muted">
                  El servidor también está en modo prueba (falta <code>EVENTOS_SOLO_PRUEBA=0</code> en Vercel). Hasta que se cambie, no se puede activar el envío real.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-text-muted">Para activar el envío real escribe <strong>ENVÍO REAL</strong>:</p>
                  <div className="flex gap-2">
                    <input className={`${input} max-w-xs`} value={conf} onChange={(e) => setConf(e.target.value)} />
                    <button type="button" className={btn.danger} disabled={pendiente || conf.trim() !== "ENVÍO REAL"} onClick={() => run(() => cambiarModoPrueba(false, conf), "Envío real activado.")}>
                      Activar envío real
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-red-700"><strong>Envío real activado.</strong> Los envíos llegan a los invitados.</p>
              <button type="button" className={btn.secondary} disabled={pendiente} onClick={() => run(() => cambiarModoPrueba(true, ""), "Modo prueba activado.")}>Volver a modo prueba</button>
            </>
          )}
        </div>
        {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p> : null}
      </div>
    </div>
  );
}
