/**
 * Envío de correo vía Microsoft Graph (app-only, permiso Mail.Send), igual que
 * icam: POST /users/{EMAIL_FROM}/sendMail. Solo servidor.
 */
import { GRAPH_BASE, getGraphToken } from "@/lib/graph/client";

export async function sendGraphMail(input: { to: string; subject: string; html: string }): Promise<void> {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) throw new Error("Falta EMAIL_FROM (buzón remitente).");
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.html },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph sendMail falló (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
  }
}

/** Resultado de un envío MIME: Graph responde 202 sin cuerpo cuando lo acepta. */
export type ResultadoGraph =
  | { ok: true; status: number; ms: number }
  | { ok: false; status: number; ms: number; reintentarTrasS: number | null; detalle: string; incierto: boolean };

/**
 * Envía un mensaje MIME ya construido (src/lib/eventos/mime.ts) desde el buzón
 * `remitente`. No lanza: devuelve el resultado para que el motor decida.
 * `incierto` = no sabemos si Microsoft lo aceptó (corte de red, timeout).
 */
export async function sendGraphMime(remitente: string, mime: string, timeoutMs = 30_000): Promise<ResultadoGraph> {
  const t0 = Date.now();
  let token: string;
  try {
    token = await getGraphToken();
  } catch (err) {
    // Antes de enviar: seguro que no ha salido nada.
    return { ok: false, status: 0, ms: Date.now() - t0, reintentarTrasS: null, detalle: err instanceof Error ? err.message : String(err), incierto: false };
  }
  try {
    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(remitente)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: Buffer.from(mime, "utf8").toString("base64"),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (res.status === 202) return { ok: true, status: 202, ms };
    const ra = Number(res.headers.get("retry-after"));
    return {
      ok: false,
      status: res.status,
      ms,
      reintentarTrasS: Number.isFinite(ra) && ra > 0 ? ra : null,
      detalle: (await res.text().catch(() => "")).slice(0, 500),
      incierto: false,
    };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, reintentarTrasS: null, detalle: err instanceof Error ? err.message : String(err), incierto: true };
  }
}
