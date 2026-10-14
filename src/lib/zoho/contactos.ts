/**
 * Paso a Zoho al marcar Contactado en un hito (ZOHO_SYNC_ENABLED=1):
 * 1. Contacto por email: si no existe se crea con propietario = el empleado que
 *    contacta; si existe solo se completan teléfono y cargo vacíos.
 * 2. Campaign del hito (módulo estándar Campaigns): se crea la primera vez.
 * 3. El contacto se añade a la Campaign con el estado de miembro configurado.
 *
 * Un fallo de Zoho nunca bloquea la app: queda anotado en hito_persona
 * (zoho_estado = 'error' y el motivo) para reintentarlo desde el hito.
 */
import { crmService } from "@/lib/db/service";
import { flags } from "@/lib/flags";
import { zohoApi } from "@/lib/zoho/client";

/**
 * Valor de Member_Status (Campaigns → Contacts) para «Contactado». Zoho solo
 * admite sus valores estándar (Planned, Invited, Sent, Received, Opened,
 * Responded, Bounced, Opted Out): contactar a alguien para un hito = «Invited».
 */
function estadoMiembro(): string {
  return process.env.ZOHO_MEMBER_STATUS_CONTACTADO?.trim() || "Invited";
}

interface ZohoUser {
  id: string;
  email: string;
}

let usuariosCache: { at: number; users: ZohoUser[] } | null = null;

/**
 * Usuario de Zoho del empleado (propietario del contacto). Necesita el scope
 * ZohoCRM.users.READ; sin él devuelve null y Zoho asigna el propietario por
 * defecto (el usuario del token) en vez de fallar.
 */
async function zohoUserId(email: string): Promise<string | null> {
  if (!usuariosCache || Date.now() - usuariosCache.at > 10 * 60_000) {
    try {
      const r = await zohoApi<{ users?: ZohoUser[] }>("/users?type=ActiveUsers&per_page=200");
      usuariosCache = { at: Date.now(), users: r.users ?? [] };
    } catch (err) {
      console.warn("[zoho] sin acceso a usuarios (falta ZohoCRM.users.READ):", err instanceof Error ? err.message : err);
      usuariosCache = { at: Date.now(), users: [] };
    }
  }
  return usuariosCache.users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id ?? null;
}

/**
 * Campos de teléfono y cargo de Contacts según el layout real de la cuenta
 * (cada organización los renombra u oculta): teléfono = Phone o, si no
 * existe, Mobile; cargo = Title si existe. Se cachea 1 hora.
 */
let camposCache: { at: number; telefono: string | null; cargo: string | null } | null = null;

async function camposContacto(): Promise<{ telefono: string | null; cargo: string | null }> {
  if (camposCache && Date.now() - camposCache.at < 60 * 60_000) return camposCache;
  const r = await zohoApi<{ fields?: { api_name: string }[] }>("/settings/fields?module=Contacts");
  const nombres = new Set((r.fields ?? []).map((f) => f.api_name));
  camposCache = {
    at: Date.now(),
    telefono: nombres.has("Phone") ? "Phone" : nombres.has("Mobile") ? "Mobile" : null,
    cargo: nombres.has("Title") ? "Title" : null,
  };
  return camposCache;
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
    const campo = await camposContacto();
    const campos: Record<string, unknown> = {
      ...partirNombre(persona.nombre as string),
      Email: persona.email,
      ...(campo.telefono && persona.telefono ? { [campo.telefono]: persona.telefono } : {}),
      ...(campo.cargo && persona.cargo ? { [campo.cargo]: persona.cargo } : {}),
    };
    if (contactId) {
      // Contacto existente: solo se completan teléfono y cargo vacíos; nunca se
      // sobrescribe lo que ya hay en Zoho.
      const leer = [campo.telefono, campo.cargo].filter(Boolean).join(",") || "Email";
      const actual = await zohoApi<{ data?: Record<string, unknown>[] }>(`/Contacts/${contactId}?fields=${leer}`);
      const enZoho = actual.data?.[0] ?? {};
      const completar: Record<string, unknown> = {};
      if (campo.telefono && !enZoho[campo.telefono] && persona.telefono) completar[campo.telefono] = persona.telefono;
      if (campo.cargo && !enZoho[campo.cargo] && persona.cargo) completar[campo.cargo] = persona.cargo;
      if (Object.keys(completar).length > 0) {
        await zohoApi(`/Contacts/${contactId}`, { method: "PUT", body: JSON.stringify({ data: [completar] }) });
      }
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
