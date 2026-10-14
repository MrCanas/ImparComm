/**
 * Cargo y teléfono desde la firma de los emails (Graph, Mail.Read).
 *
 * Para cada persona nueva de calendario sin cargo o teléfono, se lee el último
 * email que esa persona envió al empleado y se extraen SOLO esos dos campos.
 * El cuerpo del email nunca se guarda ni se registra. Requiere FIRMAS_ENABLED=1.
 */
import { crmService, type Empleado } from "@/lib/db/service";
import { graphFetch } from "@/lib/graph/client";
import { htmlATexto, parsearFirma } from "@/lib/integraciones/logica";

interface GraphMessage {
  receivedDateTime: string;
  uniqueBody?: { contentType: string; content: string };
}

export async function completarFirmas(empleado: Empleado, limite = 20) {
  const db = crmService();
  const { data, error } = await db.rpc("personas_sin_firma", { p_empleado: empleado.id, p_limite: limite });
  if (error) throw new Error(`personas_sin_firma: ${error.message}`);
  const candidatas = (data ?? []) as { persona_id: string; email: string }[];
  let actualizadas = 0;

  for (const c of candidatas) {
    const filtro = `from/emailAddress/address eq '${c.email.replace(/'/g, "''")}'`;
    const params = new URLSearchParams({ $filter: filtro, $top: "5", $select: "receivedDateTime,uniqueBody" });
    const res = await graphFetch(`/users/${encodeURIComponent(empleado.email)}/messages?${params}`, {
      headers: { Prefer: 'outlook.body-content-type="html"' },
    });
    if (!res.ok) continue;
    const mensajes = ((await res.json()) as { value: GraphMessage[] }).value
      .filter((m) => m.uniqueBody?.content)
      .sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
    if (mensajes.length === 0) continue;

    const { data: persona } = await db
      .from("personas")
      .select("nombre, cargo, telefono")
      .eq("id", c.persona_id)
      .single();
    if (!persona) continue;

    const firma = parsearFirma(htmlATexto(mensajes[0]!.uniqueBody!.content), persona.nombre as string);
    const cambios: Record<string, string> = {};
    if (!persona.cargo && firma.cargo) cambios.cargo = firma.cargo;
    if (!persona.telefono && firma.telefono) cambios.telefono = firma.telefono;
    if (Object.keys(cambios).length === 0) continue;

    await db.from("personas").update(cambios).eq("id", c.persona_id);
    actualizadas += 1;
  }
  return { revisadas: candidatas.length, actualizadas };
}
