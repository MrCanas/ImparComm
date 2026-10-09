import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

/** Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. */
export function esCronAutorizado(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const esperado = Buffer.from(`Bearer ${secret}`);
  const recibido = Buffer.from(header);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
