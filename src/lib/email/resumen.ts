/**
 * Email semanal de los viernes a las 9:00 (Madrid): contactos nuevos por
 * clasificar y recordatorios vencidos. Si un empleado no tiene nada, no se envía.
 */
import { crmService, empleadosActivos, type Empleado } from "@/lib/db/service";
import { sendGraphMail } from "@/lib/email/mailer";
import { appUrl } from "@/lib/flags";
import { fechaMadrid } from "@/lib/integraciones/logica";

export interface Vencido {
  nombre: string;
  empresa: string | null;
  dias: number;
}

export interface DatosResumen {
  nombre: string;
  pendientes: number;
  vencidos: Vencido[];
  url: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Asunto y HTML del resumen (función pura, probada en __tests__). */
export function plantillaResumen(d: DatosResumen): { subject: string; html: string } {
  const minutos = Math.max(1, Math.round(d.pendientes / 4));
  const partes: string[] = [];
  if (d.pendientes > 0) partes.push(`${d.pendientes} contacto${d.pendientes === 1 ? "" : "s"} nuevo${d.pendientes === 1 ? "" : "s"}`);
  if (d.vencidos.length > 0) partes.push(`${d.vencidos.length} recordatorio${d.vencidos.length === 1 ? "" : "s"} vencido${d.vencidos.length === 1 ? "" : "s"}`);
  const subject = `ImparComm · ${partes.join(" y ")}`;

  const filas = d.vencidos
    .slice(0, 10)
    .map(
      (v) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #EAEBEE;color:#1E2A56;font-weight:600">${esc(v.nombre)}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #EAEBEE;color:#6E6E6E">${esc(v.empresa ?? "")}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #EAEBEE;color:#B91C1C;text-align:right">hace ${v.dias} d</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F5F5F5;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:8px;overflow:hidden;border:1px solid #EAEBEE">
<tr><td style="background:#1E2A56;padding:16px 24px;color:#B89660;font-weight:700;letter-spacing:.5px">ImparComm</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px;color:#1E2A56;font-weight:600">Hola, ${esc(d.nombre)}</p>
${
  d.pendientes > 0
    ? `<p style="margin:0 0 16px">Tienes <strong>${d.pendientes} contacto${d.pendientes === 1 ? "" : "s"} nuevo${d.pendientes === 1 ? "" : "s"}</strong> por clasificar, unos ${minutos} minuto${minutos === 1 ? "" : "s"}.</p>`
    : ""
}
${
  d.vencidos.length > 0
    ? `<p style="margin:0 0 8px">Hace tiempo que no te reúnes con:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">${filas}</table>${
        d.vencidos.length > 10 ? `<p style="margin:0 0 16px;color:#6E6E6E">y ${d.vencidos.length - 10} más.</p>` : ""
      }`
    : ""
}
<a href="${esc(d.url)}" style="display:inline-block;background:#1E2A56;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${d.pendientes > 0 ? "Empezar el ritual" : "Abrir ImparComm"}</a>
</td></tr>
<tr><td style="padding:12px 24px;background:#F5F5F5;color:#6E6E6E;font-size:12px">Impar Capital · Uso interno y confidencial.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html };
}

/** Datos del resumen de un empleado (con la service role). */
export async function datosResumen(empleado: Empleado, hoy = new Date()): Promise<DatosResumen> {
  const db = crmService();
  const fecha = fechaMadrid(hoy);
  const [{ count }, { data: vencidas }] = await Promise.all([
    db.from("relaciones").select("id", { count: "exact", head: true }).eq("empleado_id", empleado.id).eq("estado", "nueva"),
    db
      .from("relaciones")
      .select("proximo_recordatorio, persona:personas(nombre, empresa:empresas(nombre))")
      .eq("empleado_id", empleado.id)
      .eq("estado", "clasificada")
      .lte("proximo_recordatorio", fecha)
      .order("proximo_recordatorio"),
  ]);
  const base = new Date(`${fecha}T12:00:00Z`).getTime();
  const vencidos = ((vencidas ?? []) as Record<string, unknown>[]).map((r) => {
    const p = (Array.isArray(r.persona) ? r.persona[0] : r.persona) as { nombre: string; empresa: unknown };
    const emp = (Array.isArray(p.empresa) ? p.empresa[0] : p.empresa) as { nombre: string } | null;
    return {
      nombre: p.nombre,
      empresa: emp?.nombre ?? null,
      dias: Math.round((base - new Date(`${r.proximo_recordatorio as string}T12:00:00Z`).getTime()) / 86_400_000),
    };
  });
  return { nombre: empleado.nombre.split(" ")[0]!, pendientes: count ?? 0, vencidos, url: `${appUrl()}/ritual` };
}

/** Envía el resumen a todos los empleados con algo pendiente, una vez por semana. */
export async function enviarResumenes(ahora = new Date()) {
  const db = crmService();
  const semana = fechaMadrid(ahora);
  const empleados = await empleadosActivos();
  const resultado = { enviados: 0, sinNada: 0, yaEnviados: 0, errores: [] as string[] };

  for (const e of empleados) {
    try {
      const { data: previo } = await db
        .from("envios_resumen")
        .select("empleado_id")
        .eq("empleado_id", e.id)
        .eq("semana", semana)
        .maybeSingle();
      if (previo) {
        resultado.yaEnviados += 1;
        continue;
      }
      const datos = await datosResumen(e, ahora);
      if (datos.pendientes === 0 && datos.vencidos.length === 0) {
        resultado.sinNada += 1;
        continue;
      }
      const { subject, html } = plantillaResumen(datos);
      await sendGraphMail({ to: e.email, subject, html });
      await db.from("envios_resumen").insert({
        empleado_id: e.id,
        semana,
        pendientes: datos.pendientes,
        vencidos: datos.vencidos.length,
      });
      resultado.enviados += 1;
    } catch (err) {
      resultado.errores.push(`${e.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return resultado;
}
