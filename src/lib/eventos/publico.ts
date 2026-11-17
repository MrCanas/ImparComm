/**
 * Acceso de la landing pública (eventos.imparcapital.com). Sin sesión: el
 * invitado se identifica solo por el token de su enlace. Service role, pero
 * SIEMPRE buscando por el hash del token y devolviendo lo mínimo. SOLO servidor.
 */
import { crmService } from "@/lib/db/service";

import { hashToken, tokenBienFormado } from "./tokens";

export interface InvitadoPublico {
  id: string;
  nombre: string | null;
  email: string;
  respuesta: "si" | "no" | "quizas" | null;
  acompanante: boolean;
  acompanante_nombre: string | null;
  telefono_rsvp: string | null;
  comentario: string | null;
}

export interface EventoPublico {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  lugar: string | null;
  direccion: string | null;
  mapa_url: string | null;
  fecha_limite: string | null;
  permite_acompanante: boolean;
  landing: { titulo?: string; intro?: string; imagen?: string; gracias_si?: string; gracias_no?: string; gracias_quizas?: string };
  estado: "borrador" | "activo" | "cerrado";
  remitente: string | null;
  remitente_nombre: string;
  ics_uid: string;
  ics_sequence: number;
}

export async function buscarPorToken(token: string): Promise<{ invitado: InvitadoPublico; evento: EventoPublico; hash: string } | null> {
  if (!tokenBienFormado(token)) return null;
  const hash = hashToken(token);
  const db = crmService();
  const { data: inv } = await db
    .from("evento_invitados")
    .select("id, evento_id, nombre, email, respuesta, acompanante, acompanante_nombre, telefono_rsvp, comentario")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!inv) return null;
  const { data: ev } = await db
    .from("eventos")
    .select("id, nombre, inicio, fin, lugar, direccion, mapa_url, fecha_limite, permite_acompanante, landing, estado, remitente, remitente_nombre, ics_uid, ics_sequence")
    .eq("id", inv.evento_id)
    .maybeSingle();
  if (!ev || ev.estado === "borrador") return null;
  const { evento_id: _e, ...invitado } = inv;
  return { invitado: invitado as InvitadoPublico, evento: ev as EventoPublico, hash };
}

export async function registrarVisita(hash: string): Promise<void> {
  await crmService().rpc("evento_registrar_visita", { p_token_hash: hash });
}

export function respuestasAbiertas(ev: EventoPublico): boolean {
  return ev.estado === "activo" && (!ev.fecha_limite || new Date(ev.fecha_limite) > new Date());
}
