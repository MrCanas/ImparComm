import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_RENEW_BELOW_S,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/jwt";

export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "",
  );
  const isAuthenticated = session !== null;
  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/login";
  // Las Server Actions son POST a la URL de la página con esta cabecera.
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  if (pathname.startsWith("/api/")) {
    // Login y logout gestionan la cookie ellos mismos.
    if (pathname.startsWith("/api/auth/")) return NextResponse.next();
    if (!isAuthenticated) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return withRenewedSession(NextResponse.next(), session);
  }

  if (isLoginPage) {
    return isAuthenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (!isAuthenticated) {
    // Una Server Action no puede seguir un 307: con x-action-redirect Next navega a /login.
    if (isServerAction) {
      return new NextResponse(null, {
        status: 200,
        headers: { "x-action-redirect": "/login", "content-type": "text/plain" },
      });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return withRenewedSession(NextResponse.next(), session);
}

/** Sesión deslizante: si quedan menos de SESSION_RENEW_BELOW_S, se emite otra de 7 días. */
async function withRenewedSession(
  response: NextResponse,
  session: Awaited<ReturnType<typeof verifySessionToken>>,
): Promise<NextResponse> {
  if (!session?.exp) return response;
  const remainingS = session.exp - Math.floor(Date.now() / 1000);
  if (remainingS >= SESSION_RENEW_BELOW_S) return response;
  try {
    const token = await signSessionToken(session.user_id);
    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  } catch (err) {
    console.error("[proxy] renovar sesión", err);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.png$|.*\\.svg$).*)",
  ],
};
