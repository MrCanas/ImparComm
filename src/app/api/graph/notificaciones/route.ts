import { after, NextRequest, NextResponse } from "next/server";

import { flags } from "@/lib/flags";
import { procesarNotificacion } from "@/lib/graph/calendario";

export const maxDuration = 120;

/**
 * Webhook de Microsoft Graph para cambios de calendario.
 * - Validación: Graph envía `?validationToken=…` y espera el mismo texto en
 *   menos de 10 s.
 * - Avisos: se responde 202 al momento y se re-sincroniza después (after()).
 *   Cada aviso se valida con el clientState guardado en crm.graph_suscripciones.
 */
export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (!flags.calendario) return new NextResponse(null, { status: 202 });

  const body = (await request.json().catch(() => ({}))) as {
    value?: { subscriptionId: string; clientState?: string }[];
  };
  // Varios avisos del mismo buzón en un lote: una sola re-sincronización.
  const unicos = new Map((body.value ?? []).map((n) => [n.subscriptionId, n.clientState]));
  after(async () => {
    for (const [subscriptionId, clientState] of unicos) {
      try {
        await procesarNotificacion(subscriptionId, clientState);
      } catch (err) {
        console.error("[graph] notificación", err instanceof Error ? err.message : err);
      }
    }
  });
  return new NextResponse(null, { status: 202 });
}
