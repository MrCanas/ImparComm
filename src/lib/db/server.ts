import { createClient } from "@supabase/supabase-js";

import { requireCurrentUser, type UserContext } from "@/lib/auth/currentUser";
import { issueSupabaseTokenForSession } from "@/lib/auth/issue-supabase-token";

function createCrmClient(url: string, anonKey: string, accessToken: string) {
  return createClient(url, anonKey, {
    db: { schema: "crm" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type CrmClient = ReturnType<typeof createCrmClient>;

/**
 * Cliente del esquema `crm` con la identidad del empleado: anon key +
 * `Authorization: Bearer <JWT del bridge>`. Todas las lecturas y escrituras de
 * CRM pasan por RLS con `auth.uid()`; la service role no se usa para estos datos.
 */
export async function getCrm(): Promise<{ db: CrmClient; user: UserContext }> {
  const user = await requireCurrentUser();
  const token = await issueSupabaseTokenForSession();
  if (!token.ok) throw new Error(`Supabase: ${token.error}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return { db: createCrmClient(url, anonKey, token.access_token), user };
}
