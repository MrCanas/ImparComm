import { cache } from "react";

import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import { createServiceRoleClient } from "@/lib/db/admin";

export interface UserContext {
  id: string;
  email: string;
  name: string;
  /** Superadmin del portal icam o admin de ImparComm (crm.permisos.es_admin). */
  isAdmin: boolean;
  /** Puede ver y adoptar la bolsa común. */
  canSeeBolsa: boolean;
}

function displayNameFromAuthUser(
  email: string,
  metadata: Record<string, unknown> | undefined,
): string {
  if (metadata) {
    if (typeof metadata.name === "string" && metadata.name.trim()) {
      return metadata.name.trim();
    }
    if (typeof metadata.full_name === "string" && metadata.full_name.trim()) {
      return metadata.full_name.trim();
    }
  }
  const local = email.split("@")[0]?.trim();
  return local || email;
}

interface AuthIdentity {
  email: string;
  metadata: Record<string, unknown> | undefined;
}

/**
 * Email y metadata del usuario en Supabase Auth, cacheados 5 minutos (igual que
 * icam). Lo que decide el acceso (cuenta activa, permisos) se lee en cada petición.
 */
function readAuthIdentity(userId: string): Promise<AuthIdentity | null> {
  return unstable_cache(
    async (): Promise<AuthIdentity | null> => {
      const admin = createServiceRoleClient();
      const { data, error } = await admin.auth.admin.getUserById(userId);
      // Usuario borrado en Auth: sin identidad (sesión inválida). Otro error: temporal.
      if (error?.status === 404 || (!error && !data.user)) return null;
      if (error) throw new Error(`getUserById: ${error.message}`);
      const email = data.user.email?.trim() ?? "";
      if (!email) return null;
      return {
        email,
        metadata: data.user.user_metadata as Record<string, unknown> | undefined,
      };
    },
    ["auth-identity", userId],
    { revalidate: 300, tags: [`auth-identity:${userId}`] },
  )();
}

/** Supabase no responde: no se cierra la sesión, se muestra el error y se reintenta. */
export class AuthNoDisponibleError extends Error {
  constructor(cause: unknown) {
    super("Supabase no disponible");
    this.name = "AuthNoDisponibleError";
    this.cause = cause;
  }
}

/**
 * `null` = la sesión ya no vale (usuario borrado o cuenta desactivada).
 * Lanza AuthNoDisponibleError si Supabase falla: eso no debe cerrar la sesión.
 */
export async function loadUserContext(userId: string): Promise<UserContext | null> {
  const admin = createServiceRoleClient();

  let identity: AuthIdentity | null;
  try {
    identity = await readAuthIdentity(userId);
  } catch (err) {
    throw new AuthNoDisponibleError(err);
  }
  if (!identity) return null;

  const [accountResult, permisosResult] = await Promise.all([
    admin
      .from("app_user_account")
      .select("is_platform_admin, is_active")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .schema("crm")
      .from("permisos")
      .select("es_admin, ve_bolsa")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (accountResult.error) {
    throw new AuthNoDisponibleError(new Error(`app_user_account: ${accountResult.error.message}`));
  }

  // Fila ausente = cuenta activa (mismo criterio que icam).
  const account = accountResult.data;
  if (account && account.is_active === false) return null;

  // Si el esquema crm aún no está migrado o expuesto, se trata como sin permisos.
  const permisos = permisosResult.error ? null : permisosResult.data;
  const isAdmin = account?.is_platform_admin === true || permisos?.es_admin === true;

  return {
    id: userId,
    email: identity.email,
    name: displayNameFromAuthUser(identity.email, identity.metadata),
    isAdmin,
    canSeeBolsa: isAdmin || permisos?.ve_bolsa === true,
  };
}

/**
 * SERVER: memoizado por request con React cache().
 * `null` = sin sesión válida. Si Supabase no responde lanza AuthNoDisponibleError
 * (antes devolvía null: cerraba la sesión y, con la cookie aún válida, el proxy
 * y la app se mandaban el uno al otro entre /login y / sin fin).
 */
export const getCurrentUser = cache(async (): Promise<UserContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const verified = await verifySessionToken(token);
  if (!verified) return null;
  return loadUserContext(verified.user_id);
});

/** Hay cookie de sesión con firma válida, aunque la cuenta ya no exista o esté de baja. */
export async function haySesionFirmada(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return !!token && (await verifySessionToken(token)) !== null;
}

/** SERVER: igual que getCurrentUser pero exige sesión. */
export async function requireCurrentUser(): Promise<UserContext> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autorizado");
  return user;
}
