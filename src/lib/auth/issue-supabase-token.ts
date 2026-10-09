import { createClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth/currentUser";

export type IssueSupabaseTokenResult =
  | { ok: true; access_token: string; expires_at: string }
  | { ok: false; status: 401 | 404 | 500; error: string };

/** Margen antes de expirar para reutilizar el JWT sin llamar a verifyOtp de nuevo. */
const TOKEN_REUSE_BUFFER_MS = 2 * 60 * 1000;

type CachedBridgeToken = {
  access_token: string;
  expires_at: string;
  expires_at_ms: number;
};

const bridgeTokenCache = new Map<string, CachedBridgeToken>();
const bridgeTokenInflight = new Map<string, Promise<IssueSupabaseTokenResult>>();

function cacheKeyForEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readCachedToken(key: string): CachedBridgeToken | null {
  const cached = bridgeTokenCache.get(key);
  if (!cached) return null;
  if (cached.expires_at_ms - Date.now() <= TOKEN_REUSE_BUFFER_MS) {
    bridgeTokenCache.delete(key);
    return null;
  }
  return cached;
}

function storeCachedToken(key: string, access_token: string, expires_at: string) {
  const expires_at_ms = new Date(expires_at).getTime();
  bridgeTokenCache.set(key, { access_token, expires_at, expires_at_ms });
}

/** Invalida la caché del bridge (p. ej. logout). */
export function clearSupabaseBridgeTokenServerCache(email?: string): void {
  if (email) {
    const key = cacheKeyForEmail(email);
    bridgeTokenCache.delete(key);
    bridgeTokenInflight.delete(key);
    return;
  }
  bridgeTokenCache.clear();
  bridgeTokenInflight.clear();
}

function getConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL");
  if (!serviceKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey)
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_ANON_KEY",
    );

  return { url, serviceKey, anonKey };
}

/**
 * Emite un access_token Supabase para el usuario de la sesión actual.
 *
 * Flujo (admin API + verifyOtp):
 *   1. Verificar cookie impar-comm-auth → email del usuario.
 *   2. generateLink({ type: 'magiclink', email }) con service_role — genera un
 *      hashed_token sin enviar ningún email (lo consumimos en backend).
 *   3. verifyOtp({ token_hash, type: 'magiclink' }) con anon key — canjea el
 *      token por una sesión real firmada con las claves actuales del proyecto
 *      (ECC P-256 o HS256 según configuración Supabase). GoTrue firma el JWT;
 *      nosotros nunca tocamos la clave privada.
 *
 * Por qué NO firmamos con HS256 manualmente:
 *   El proyecto usa "JWT Signing Keys" asimétricos (ECC P-256) como current key.
 *   La clave privada no es accesible desde fuera; el approach HS256 con
 *   SUPABASE_JWT_SECRET está deprecated en proyectos con asymmetric signing.
 *
 * Coste: 2 round-trips a Supabase Auth por emisión si no hay token en caché.
 *   Servidor y navegador reutilizan el JWT hasta ~2 min antes de `expires_at`.
 */
async function mintSupabaseTokenForEmail(
  email: string,
): Promise<IssueSupabaseTokenResult> {
  let url: string;
  let serviceKey: string;
  let anonKey: string;
  try {
    ({ url, serviceKey, anonKey } = getConfig());
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Configuración incompleta",
    };
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1: generate a magic link (not sent by email; consumed immediately here)
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError) {
    return {
      ok: false,
      status: linkError.status === 404 ? 404 : 500,
      error: `generateLink: ${linkError.message}`,
    };
  }

  const hashedToken = linkData?.properties?.hashed_token;
  if (!hashedToken) {
    return {
      ok: false,
      status: 500,
      error: "generateLink: hashed_token ausente en la respuesta",
    };
  }

  // Step 2: exchange hashed_token for a real Supabase session (GoTrue signs JWT)
  const transientClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sessionData, error: sessionError } =
    await transientClient.auth.verifyOtp({
      token_hash: hashedToken,
      type: "magiclink",
    });

  if (sessionError || !sessionData.session) {
    return {
      ok: false,
      status: 500,
      error: `verifyOtp: ${sessionError?.message ?? "sin sesión"}`,
    };
  }

  const { access_token, expires_at } = sessionData.session;

  const expires_at_iso =
    typeof expires_at === "number"
      ? new Date(expires_at * 1000).toISOString()
      : expires_at ?? new Date(Date.now() + 3600 * 1000).toISOString();

  return { ok: true, access_token, expires_at: expires_at_iso };
}

export async function issueSupabaseTokenForSession(): Promise<IssueSupabaseTokenResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, error: "No autorizado" };
  }

  const cacheKey = cacheKeyForEmail(user.email);
  const cached = readCachedToken(cacheKey);
  if (cached) {
    return {
      ok: true,
      access_token: cached.access_token,
      expires_at: cached.expires_at,
    };
  }

  const inflight = bridgeTokenInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = mintSupabaseTokenForEmail(user.email).then((result) => {
    if (result.ok) {
      storeCachedToken(cacheKey, result.access_token, result.expires_at);
    }
    return result;
  });

  bridgeTokenInflight.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    bridgeTokenInflight.delete(cacheKey);
  }
}
