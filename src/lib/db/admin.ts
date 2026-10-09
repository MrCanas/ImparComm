import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role — solo importar desde Route Handlers / Server Actions.
 * Omite RLS; usar solo tras validar sesión ICAM en la petición.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key);
}
