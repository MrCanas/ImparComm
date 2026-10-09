import { createServiceRoleClient } from "@/lib/db/admin";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resuelve `auth.users.id` por email (service role).
 *
 * Usa la RPC `auth_user_id_by_email` (migración 032): un SELECT indexado, sin
 * paginar y sin el oráculo de enumeración que tenía listUsers. Si la RPC aún no
 * está aplicada en el entorno, cae a la paginación antigua para no romper el
 * login mientras tanto.
 */
export async function resolveAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const target = normalizeEmail(email);

  const { data, error } = await admin.rpc("auth_user_id_by_email", {
    p_email: target,
  });

  if (!error) {
    return (data as string | null) ?? null;
  }

  // La RPC no existe todavía (migración 032 sin aplicar): fallback antiguo.
  if (!/could not find|does not exist|PGRST202|42883/i.test(error.message ?? "")) {
    throw new Error(`auth_user_id_by_email: ${error.message}`);
  }
  return resolveByPagination(admin, target);
}

async function resolveByPagination(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers: ${error.message}`);
    }
    for (const user of data.users) {
      if (user.email && normalizeEmail(user.email) === target) {
        return user.id;
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}
