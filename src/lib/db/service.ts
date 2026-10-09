import { createServiceRoleClient } from "@/lib/db/admin";

/**
 * Esquema crm con la service role, para procesos sin sesión de empleado
 * (crons, webhook de Graph, Zoho). Omite RLS: usarlo solo desde rutas que ya
 * validaron CRON_SECRET / clientState, o tras validar la sesión.
 */
export function crmService() {
  return createServiceRoleClient().schema("crm");
}

export interface Empleado {
  id: string;
  email: string;
  nombre: string;
}

/**
 * Empleados activos con buzón en un dominio interno: los que tienen calendario
 * que leer y a los que se envía el resumen. Cuenta sin fila en app_user_account
 * = activa (mismo criterio que icam).
 */
export async function empleadosActivos(): Promise<Empleado[]> {
  const admin = createServiceRoleClient();
  const [{ data: dominios }, { data: inactivos }] = await Promise.all([
    admin.schema("crm").rpc("dominios_internos"),
    admin.from("app_user_account").select("user_id").eq("is_active", false),
  ]);
  const internos = new Set(((dominios as string[] | null) ?? ["imparcapital.com"]).map((d) => d.toLowerCase()));
  const bajas = new Set((inactivos ?? []).map((r) => r.user_id as string));

  const empleados: Empleado[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) {
      const email = u.email?.toLowerCase();
      if (!email || bajas.has(u.id) || !internos.has(email.split("@")[1] ?? "")) continue;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const nombre =
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        email.split("@")[0]!;
      empleados.push({ id: u.id, email, nombre });
    }
    if (data.users.length < 200) break;
  }
  return empleados;
}
