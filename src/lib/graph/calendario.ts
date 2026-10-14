/**
 * Captura de reuniones desde Microsoft Graph.
 *
 * Requiere el permiso de aplicación Calendars.Read con consentimiento del
 * administrador (hoy la app solo tiene Mail.Read y Mail.Send) y
 * CALENDARIO_ENABLED=1. Funcionamiento:
 * - Repaso nocturno (cron): ventana [hoy − 30 días, hoy + 14 días] de cada
 *   empleado activo; registra cada evento con asistentes externos y borra el
 *   rastro de los eventos que ya no existen en ningún calendario.
 * - Aviso al instante (webhook): suscripción por buzón a cambios de eventos;
 *   caduca a los 7 días como máximo y el cron la renueva.
 *
 * Solo servidor.
 */
import { randomBytes } from "node:crypto";

import { crmService, empleadosActivos, type Empleado } from "@/lib/db/service";
import { appUrl } from "@/lib/flags";
import { graphFetch } from "@/lib/graph/client";
import { externosDeEvento } from "@/lib/integraciones/logica";

const DIA_MS = 86_400_000;
const VENTANA_ATRAS_DIAS = 30;
const VENTANA_ADELANTE_DIAS = 14;
/** Graph admite hasta 10 080 min (7 días) en eventos de Outlook; se renueva antes. */
const SUSCRIPCION_DIAS = 6;

interface GraphEvent {
  iCalUId: string;
  subject?: string | null;
  isCancelled?: boolean;
  start?: { dateTime: string; timeZone: string };
  attendees?: { emailAddress?: { address?: string; name?: string } }[];
  organizer?: { emailAddress?: { address?: string; name?: string } };
}

async function dominiosInternos(): Promise<string[]> {
  const { data } = await crmService().rpc("dominios_internos");
  return (data as string[] | null) ?? ["imparcapital.com"];
}

async function leerEventos(email: string, desde: Date, hasta: Date): Promise<GraphEvent[]> {
  const params = new URLSearchParams({
    startDateTime: desde.toISOString(),
    endDateTime: hasta.toISOString(),
    $select: "iCalUId,subject,isCancelled,start,attendees,organizer",
    $top: "100",
  });
  let url: string | null = `/users/${encodeURIComponent(email)}/calendarView?${params}`;
  const eventos: GraphEvent[] = [];
  while (url) {
    const res = await graphFetch(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) {
      throw new Error(`Graph calendarView ${email}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
    eventos.push(...body.value);
    url = body["@odata.nextLink"] ?? null;
  }
  return eventos;
}

export interface ResultadoSync {
  empleado: string;
  eventos: number;
  conExternos: number;
  relacionesNuevas: number;
  vistos: string[];
}

/** Sincroniza la ventana de calendario de un empleado. */
export async function sincronizarEmpleado(
  empleado: Empleado,
  desde: Date,
  hasta: Date,
  internos?: string[],
): Promise<ResultadoSync> {
  const dominios = internos ?? (await dominiosInternos());
  const db = crmService();
  const eventos = await leerEventos(empleado.email, desde, hasta);
  const resultado: ResultadoSync = {
    empleado: empleado.email,
    eventos: eventos.length,
    conExternos: 0,
    relacionesNuevas: 0,
    vistos: [],
  };

  for (const ev of eventos) {
    if (ev.isCancelled || !ev.iCalUId || !ev.start) continue;
    resultado.vistos.push(ev.iCalUId);
    const externos = externosDeEvento(ev, dominios);
    if (externos.length === 0) continue;
    resultado.conExternos += 1;
    const { data, error } = await db.rpc("registrar_reunion", {
      p_empleado: empleado.id,
      p_ical_uid: ev.iCalUId,
      p_fecha: new Date(`${ev.start.dateTime.replace(/Z?$/, "Z")}`).toISOString(),
      p_asunto: ev.subject ?? null,
      p_externos: externos,
    });
    if (error) throw new Error(`registrar_reunion: ${error.message}`);
    resultado.relacionesNuevas += (data as number) ?? 0;
  }
  return resultado;
}

/**
 * Repaso completo de todos los empleados. Solo borra reuniones desaparecidas
 * si TODOS los calendarios se leyeron bien (si no, un fallo de Graph borraría
 * reuniones que siguen existiendo).
 */
export async function sincronizarTodos(ahora = new Date()) {
  const desde = new Date(ahora.getTime() - VENTANA_ATRAS_DIAS * DIA_MS);
  const hasta = new Date(ahora.getTime() + VENTANA_ADELANTE_DIAS * DIA_MS);
  const internos = await dominiosInternos();
  const empleados = await empleadosActivos();

  const resultados: ResultadoSync[] = [];
  const errores: { empleado: string; error: string }[] = [];
  for (const e of empleados) {
    try {
      resultados.push(await sincronizarEmpleado(e, desde, hasta, internos));
    } catch (err) {
      errores.push({ empleado: e.email, error: err instanceof Error ? err.message : String(err) });
    }
  }

  let borradas = 0;
  if (errores.length === 0 && empleados.length > 0) {
    const vistos = [...new Set(resultados.flatMap((r) => r.vistos))];
    const { data, error } = await crmService().rpc("borrar_reuniones_ausentes", {
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
      p_vistas: vistos,
    });
    if (error) throw new Error(`borrar_reuniones_ausentes: ${error.message}`);
    borradas = (data as number) ?? 0;
  }

  return {
    empleados: empleados.length,
    relacionesNuevas: resultados.reduce((s, r) => s + r.relacionesNuevas, 0),
    reunionesConExternos: resultados.reduce((s, r) => s + r.conExternos, 0),
    reunionesBorradas: borradas,
    errores,
  };
}

// ─── Suscripciones (webhook) ─────────────────────────────────────────────────

/** Crea o renueva la suscripción de cada empleado activo. */
export async function renovarSuscripciones(ahora = new Date()) {
  const db = crmService();
  const empleados = await empleadosActivos();
  const { data: existentes } = await db.from("graph_suscripciones").select("*");
  const porUsuario = new Map((existentes ?? []).map((s) => [s.user_id as string, s]));
  const expira = new Date(ahora.getTime() + SUSCRIPCION_DIAS * DIA_MS).toISOString();
  const resultado = { creadas: 0, renovadas: 0, errores: [] as string[] };

  for (const e of empleados) {
    const actual = porUsuario.get(e.id);
    try {
      if (actual) {
        const res = await graphFetch(`/subscriptions/${actual.subscription_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expirationDateTime: expira }),
        });
        if (res.ok) {
          await db.from("graph_suscripciones").update({ expira, updated_at: ahora.toISOString() }).eq("user_id", e.id);
          resultado.renovadas += 1;
          continue;
        }
        // Caducada o borrada en Graph: se crea otra.
        await db.from("graph_suscripciones").delete().eq("user_id", e.id);
      }
      const clientState = randomBytes(24).toString("hex");
      const res = await graphFetch("/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeType: "created,updated,deleted",
          notificationUrl: `${appUrl()}/api/graph/notificaciones`,
          resource: `users/${e.email}/events`,
          expirationDateTime: expira,
          clientState,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const sub = (await res.json()) as { id: string };
      await db.from("graph_suscripciones").insert({
        user_id: e.id,
        buzon: e.email,
        subscription_id: sub.id,
        client_state: clientState,
        expira,
      });
      resultado.creadas += 1;
    } catch (err) {
      resultado.errores.push(`${e.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return resultado;
}

/** Procesa un aviso de Graph: re-sincroniza la ventana corta de ese buzón. */
export async function procesarNotificacion(subscriptionId: string, clientState: string | undefined) {
  const db = crmService();
  const { data: sub } = await db
    .from("graph_suscripciones")
    .select("user_id, buzon, client_state")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  // clientState es el secreto compartido: sin coincidencia, el aviso se ignora.
  if (!sub || sub.client_state !== clientState) return { ignorada: true };

  const ahora = Date.now();
  await sincronizarEmpleado(
    { id: sub.user_id as string, email: sub.buzon as string, nombre: "" },
    new Date(ahora - 2 * DIA_MS),
    new Date(ahora + VENTANA_ADELANTE_DIAS * DIA_MS),
  );
  return { ignorada: false };
}
