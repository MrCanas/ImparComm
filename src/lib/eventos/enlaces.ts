/** URLs públicas de la landing de eventos (eventos.imparcapital.com). */
import { appUrl } from "@/lib/flags";

import { tokenInvitado } from "./tokens";

/** Base pública de la landing. EVENTOS_URL = https://eventos.imparcapital.com en producción. */
export function eventosUrl(): string {
  const explicita = process.env.EVENTOS_URL?.trim();
  return (explicita || appUrl()).replace(/\/+$/, "");
}

export function enlacesInvitado(invitadoId: string) {
  const token = tokenInvitado(invitadoId);
  const base = eventosUrl();
  return {
    token,
    respuesta: `${base}/e/${token}`,
    baja: `${base}/baja/${token}`,
    calendario: `${base}/ics/${token}`,
  };
}
