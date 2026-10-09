/**
 * Paso a Zoho al marcar Contactado en un hito (ZOHO_SYNC_ENABLED=1):
 * 1. Contacto por email: si no existe se crea con propietario = el empleado que
 *    contacta; si existe se actualizan teléfono y cargo (sin cambiar propietario).
 * 2. Campaign del hito (módulo estándar Campaigns): se crea la primera vez.
 * 3. El contacto se añade a la Campaign con el estado de miembro configurado.
 *
 * Un fallo de Zoho nunca bloquea la app: queda anotado en hito_persona
 * (zoho_estado = 'error' y el motivo) para reintentarlo desde el hito.
 */
import { crmService } from "@/lib/db/service";
import { flags } from "@/lib/flags";
import { zohoApi } from "@/lib/zoho/client";

/** Valor del picklist Member_Status de Campaigns para «Contactado». */
function estadoMiembro(): string {
  return process.env.ZOHO_MEMBER_STATUS_CONTACTADO?.trim() || "Contacted";
}

interface ZohoUser {
  id: string;
  email: string;
}

let usuariosCache: { at: number; users: ZohoUser[] } | null = null;

async function zohoUserId(email: string): Promise<string | null> {
  if (!usuariosCache || Date.now() - usuariosCache.at > 10 * 60_000) {
    const r = await zohoApi<{ users?: ZohoUser[] }>("/users?type=ActiveUsers&per_page=200");
    usuariosCache = { at: Date.now(), users: r.users ?? [] };
  }
  return usuariosCache.users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id ?? null;
}

function partirNombre(nombre: string): { First_Name?: string; Last_Name: string } {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return { Last_Name: partes[0]! };
  return { First_Name: partes[0], Last_Name: partes.slice(1).join(" ") };
}

export async function registrarContactoEnZoho(input: {
  hitoId: string;
  personaId: string;
  empleadoEmail: string;
}): Promise<{ estado: "ok" | "error" | "desactivado"; error?: string }> {
  const db = crmService();
  const marcar = async (estado: "ok" | "error" | "desactivado", error?: string) => {
    await db
      .from("hito_persona")
      .update({ zoho_estado: estado, zoho_error: error ?? null })
      .eq("hito_id", input.hitoId)
      .eq("persona_id", input.personaId);
    return { estado, error };
  };

  if (!flags.zoho) return marcar("desactivado");

  try {
    const [{ data: persona }, { data: hito }] = await Promise.all([
      db.from("personas").select("id, nombre, email, telefono, cargo, zoho_id").eq("id", input.personaId).single(),
      db.from("hitos").select("id, nombre, zoho_campaign_id").eq("id", input.hitoId).single(),
    ]);
    if (!persona || !hito) throw new Error("Persona o hito no encontrados");
    if (!persona.email) throw new Error("La persona no tiene email: Zoho deduplica por email");

    // 1. Contacto
    let contactId = persona.zoho_id as string | null;
    if (!contactId) {
      const found = await zohoApi<{ data?: { id: string }[] }>(
        `/Contacts/search?email=${encodeURIComponent(persona.email as string)}`,
      );
      contactId = found.data?.[0]?.id ?? null;
    }
    const campos: Record<string, unknown> = {
      ...partirNombre(persona.nombre as string),
      Email: persona.email,
      ...(persona.telefono ? { Phone: persona.telefono } : {}),
      ...(persona.cargo ? { Title: persona.cargo } : {}),
    };
    if (contactId) {
      await zohoApi(`/Contacts/${contactId}`, { method: "PUT", body: JSON.stringify({ data: [campos] }) });
    } else {
      const owner = await zohoUserId(input.empleadoEmail);
      const creado = await zohoApi<{ data: { details: { id: string } }[] }>("/Contacts", {
        method: "POST",
        body: JSON.stringify({ data: [{ ...campos, ...(owner ? { Owner: { id: owner } } : {}) }] }),
      });
      contactId = creado.data[0]!.details.id;
    }
    if (contactId !== persona.zoho_id) await db.from("personas").update({ zoho_id: contactId }).eq("id", persona.id);

    // 2. Campaign del hito
    let campaignId = hito.zoho_campaign_id as string | null;
    if (!campaignId) {
      const creada = await zohoApi<{ data: { details: { id: string } }[] }>("/Campaigns", {
        method: "POST",
        body: JSON.stringify({ data: [{ Campaign_Name: hito.nombre, Status: "Active" }] }),
      });
      campaignId = creada.data[0]!.details.id;
      await db.from("hitos").update({ zoho_campaign_id: campaignId }).eq("id", hito.id);
    }

    // 3. Miembro de la Campaign
    await zohoApi(`/Campaigns/${campaignId}/Contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify({ data: [{ Member_Status: estadoMiembro() }] }),
    });

    return marcar("ok");
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("[zoho] registrarContactoEnZoho", mensaje);
    return marcar("error", mensaje.slice(0, 500));
  }
}
