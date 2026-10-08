import { SignJWT, jwtVerify } from "jose";

const ALGORITHM = "HS256";

/** Cookie de sesión de ImparComm (mismo AUTH_JWT_SECRET que icam). */
export const SESSION_COOKIE_NAME = "impar-comm-auth";

/** Vida de la sesión: 7 días, renovados mientras el usuario siga usando el portal. */
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE_S,
  path: "/",
};

/**
 * Por debajo de este tiempo restante, el proxy emite una sesión nueva. Sin
 * renovación la sesión caducaba a los 7 días exactos del login aunque el
 * usuario estuviera trabajando, y sus guardados fallaban a mitad de uso.
 */
export const SESSION_RENEW_BELOW_S = 60 * 60 * 24 * 3;

function getJwtSecret(): Uint8Array {
  const raw = process.env.AUTH_JWT_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET debe estar definido en .env.local (mínimo 32 caracteres).",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Firma el JWT de sesión del portal (cookie impar-comm-auth).
 * `sub` = auth.users.id
 */
export async function signSessionToken(
  userId: string,
  expiresIn: string | number = "7d",
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<{ user_id: string; exp: number | null } | null> {
  if (!token || token === "authenticated") {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: [ALGORITHM],
    });
    const user_id = typeof payload.sub === "string" ? payload.sub : null;
    if (!user_id) return null;
    return { user_id, exp: typeof payload.exp === "number" ? payload.exp : null };
  } catch {
    return null;
  }
}
