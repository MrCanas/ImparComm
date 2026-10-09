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
