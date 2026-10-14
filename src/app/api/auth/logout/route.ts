import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/jwt";

// Solo POST: un GET destructivo se dispara con un <img> de terceros (CSRF de logout).
// Con SameSite=None (pestaña de Teams) la cookie viaja también en POST de otros
// sitios: se exige que el formulario venga de la propia app.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  // Mismos atributos que al crearla (Partitioned incluido) o el navegador no la borra.
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
