"use server";

import { headers } from "next/headers";

import { comprobarRateLimit } from "@/lib/auth/rate-limit";
import { crmService } from "@/lib/db/service";
import { hashToken, tokenBienFormado } from "@/lib/eventos/tokens";

export type RespuestaLanding = { ok: true; respuesta: "si" | "no" | "quizas" } | { ok: false; error: string };

async function limitar(clave: string): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  return comprobarRateLimit(`eventos:${clave}:${ip}`, { max: 20, ventanaMs: 10 * 60_000 }).permitido;
}

const txt = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function responder(token: string, f: FormData): Promise<RespuestaLanding> {
  if (!tokenBienFormado(token)) return { ok: false, error: "Enlace no válido." };
  if (!(await limitar("rsvp"))) return { ok: false, error: "Demasiados intentos. Inténtalo de nuevo en unos minutos." };
  const respuesta = txt(f.get("respuesta"), 10);
  if (!["si", "no", "quizas"].includes(respuesta)) return { ok: false, error: "Elige una respuesta." };
  const { data, error } = await crmService().rpc("evento_responder", {
    p_token_hash: hashToken(token),
    p_respuesta: respuesta,
    p_acompanante: f.get("acompanante") === "on",
    p_acompanante_nombre: txt(f.get("acompanante_nombre"), 120),
    p_telefono: txt(f.get("telefono"), 40),
    p_comentario: txt(f.get("comentario"), 1000),
  });
  if (error) {
    console.error("[eventos landing]", error.message);
    return { ok: false, error: "No hemos podido guardar tu respuesta. Inténtalo de nuevo." };
  }
  const r = data as { ok: boolean; error?: string; respuesta?: "si" | "no" | "quizas" };
  if (!r.ok) {
    return { ok: false, error: r.error === "cerrado" ? "El plazo para responder ha terminado." : "Enlace no válido." };
  }
  return { ok: true, respuesta: r.respuesta! };
}

export async function darDeBaja(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!tokenBienFormado(token)) return { ok: false, error: "Enlace no válido." };
  if (!(await limitar("baja"))) return { ok: false, error: "Demasiados intentos." };
  const { data, error } = await crmService().rpc("evento_baja", { p_token_hash: hashToken(token) });
  if (error || !(data as { ok: boolean }).ok) return { ok: false, error: "Enlace no válido." };
  return { ok: true };
}
