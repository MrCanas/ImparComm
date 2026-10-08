import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  signSessionToken,
} from "@/lib/auth/jwt";
import { comprobarRateLimit, limpiarRateLimit } from "@/lib/auth/rate-limit";
import { resolveAuthUserIdByEmail } from "@/lib/auth/resolve-auth-user";
import { createServiceRoleClient } from "@/lib/db/admin";

const GENERIC_AUTH_ERROR = "Email o contraseña incorrectos";

/** 8 intentos por (IP + email) cada 5 minutos. Suficiente para el equipo de Impar. */
const RATE_LIMIT = { max: 8, ventanaMs: 5 * 60 * 1000 };

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const email = (body.email ?? body.username)?.trim();
  const password = body.password;

  if (!email || typeof password !== "string" || !password) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // Freno de fuerza bruta: por IP + email, antes de tocar bcrypt o la base.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
  const clave = `${ip}:${email.toLowerCase()}`;
  const limite = comprobarRateLimit(clave, RATE_LIMIT);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: `Demasiados intentos. Prueba de nuevo en ${limite.reintentarEnSeg} s.` },
      { status: 429, headers: { "Retry-After": String(limite.reintentarEnSeg) } },
    );
  }

  let userId: string | null;
  try {
    userId = await resolveAuthUserIdByEmail(email);
  } catch {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: passwordRow, error: passwordError } = await admin
    .from("app_user_password")
    .select("password_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (passwordError || !passwordRow?.password_hash) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const passwordMatch = await bcrypt.compare(
    password,
    passwordRow.password_hash,
  );

  if (!passwordMatch) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // Cuenta desactivada: mismo error genérico, no revelar que existe.
  const { data: accountRow, error: accountError } = await admin
    .from("app_user_account")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError || accountRow?.is_active === false) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  let token: string;
  try {
    token = await signSessionToken(userId);
  } catch (err) {
    console.error("[auth/login] signSessionToken failed", err);
    return NextResponse.json(
      { error: "Error de configuración de sesión" },
      { status: 500 },
    );
  }

  // Login correcto: limpia el contador para que no arrastre bloqueo.
  limpiarRateLimit(clave);

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return response;
}
