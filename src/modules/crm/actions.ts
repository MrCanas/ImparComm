"use server";

import { revalidatePath } from "next/cache";

import { resolveAuthUserIdByEmail } from "@/lib/auth/resolve-auth-user";
import { getCrm } from "@/lib/db/server";
import { datosResumen, plantillaResumen } from "@/lib/email/resumen";
import { sendGraphMail } from "@/lib/email/mailer";
import { flags } from "@/lib/flags";
import { sincronizarEmpleado } from "@/lib/graph/calendario";
import { completarFirmas } from "@/lib/graph/firmas";
import { registrarContactoEnZoho } from "@/lib/zoho/contactos";
import { CANALES, type TipoEtiqueta } from "@/modules/crm/types";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Mensajes de PostgREST/Postgres que no deben llegar tal cual al usuario. */
const ERRORES_CONOCIDOS: [RegExp, string][] = [
  [/permission denied|row-level security|42501|No autorizado/i, "No tienes permiso para hacer esto"],
  [/duplicate key|23505/i, "Ya existe un registro igual"],
  [/violates check constraint|invalid input syntax|22P02|23514/i, "Valor no válido"],
  [/violates foreign key|23503/i, "Hay datos relacionados que lo impiden"],
  [/JWT|token/i, "La sesión ha caducado: vuelve a entrar"],
];

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[crm action]", message);
  // Los mensajes propios de la app (lanzados con texto en español) se muestran tal cual.
  const conocido = ERRORES_CONOCIDOS.find(([re]) => re.test(message));
  if (conocido && !/ya no existe|no tienes permiso|Solo quien|dominio/i.test(message)) return { ok: false, error: conocido[1] };
  return { ok: false, error: message.replace(/^.*?:\s/, "") || "Error inesperado" };
}

/**
 * Lanza si la operación no tocó ninguna fila. Con RLS, un update o delete sobre
 * una fila ajena no falla: devuelve 0 filas, y la acción decía «ok» sin hacer nada.
 */
function exigirFilas(res: { data: unknown[] | null; error: { message: string } | null }, que: string): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error(`${que}: no tienes permiso o ya no existe`);
}

/** `%` y `_` son comodines en ILIKE: escapados, el texto del usuario se compara literal. */
function literalLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

// ─── Contactos ───────────────────────────────────────────────────────────────

export async function altaManual(formData: FormData): Promise<ActionResult<{ personaId: string }>> {
  try {
    const { db } = await getCrm();
    const nombre = texto(formData.get("nombre"));
    const email = texto(formData.get("email"));
    const telefono = texto(formData.get("telefono"));
    if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
    if (!email && !telefono) return { ok: false, error: "Indica al menos un email o un teléfono" };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "El email no es válido" };
    }
    const { data, error } = await db.rpc("alta_manual", {
      p_nombre: nombre,
      p_email: email,
      p_telefono: telefono,
      p_cargo: texto(formData.get("cargo")),
      p_empresa: texto(formData.get("empresa")),
      p_notas: texto(formData.get("notas")),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, data: { personaId: data as string } };
  } catch (err) {
    return fail(err);
  }
}

export async function actualizarPersona(personaId: string, formData: FormData): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    const nombre = texto(formData.get("nombre"));
    const email = texto(formData.get("email")).toLowerCase() || null;
    const telefono = texto(formData.get("telefono")) || null;
    if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
    if (!email && !telefono) return { ok: false, error: "Indica al menos un email o un teléfono" };

    let empresaId: string | null = null;
    const empresa = texto(formData.get("empresa"));
    if (empresa) {
      const { data: existente } = await db.from("empresas").select("id").ilike("nombre", literalLike(empresa)).limit(1).maybeSingle();
      if (existente) {
        empresaId = existente.id as string;
      } else {
        const { data: nueva, error } = await db.from("empresas").insert({ nombre: empresa }).select("id").single();
        if (error) throw new Error(error.message);
        empresaId = nueva.id as string;
      }
    }

    const { error } = await db
      .from("personas")
      .update({ nombre, email, telefono, cargo: texto(formData.get("cargo")) || null, empresa_id: empresaId })
      .eq("id", personaId);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ya existe otra persona con ese email" };
      throw new Error(error.message);
    }
    revalidatePath(`/contactos/${personaId}`);
    revalidatePath("/contactos");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function guardarNotas(relacionId: string, personaId: string, notas: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    exigirFilas(await db.from("relaciones").update({ notas: notas.trim() || null }).eq("id", relacionId).select("id"), "Notas");
    revalidatePath(`/contactos/${personaId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Cambia el estado de la relación. Los puntos los gestiona el trigger en la base. */
export async function cambiarEstado(
  relacionId: string,
  estado: "nueva" | "clasificada" | "archivada",
): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    exigirFilas(await db.from("relaciones").update({ estado }).eq("id", relacionId).select("id"), "Contacto");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Recupera un contacto archivado: vuelve a «clasificada» si tiene etiquetas, si no a «nueva». */
export async function recuperar(relacionId: string, tieneEtiquetas: boolean): Promise<ActionResult> {
  return cambiarEstado(relacionId, tieneEtiquetas ? "clasificada" : "nueva");
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

export async function crearEtiqueta(
  nombre: string,
  tipo: TipoEtiqueta,
): Promise<ActionResult<{ id: string; nombre: string; tipo: TipoEtiqueta; plazo_dias: number }>> {
  try {
    const { db, user } = await getCrm();
    const limpio = nombre.trim().replace(/\s+/g, " ");
    if (!limpio) return { ok: false, error: "Escribe un nombre" };

    // Si ya existe (mismo nombre sin mayúsculas), se reutiliza en vez de duplicar.
    const { data: existente } = await db
      .from("etiquetas")
      .select("id, nombre, tipo, plazo_dias")
      .ilike("nombre", literalLike(limpio))
      .eq("tipo", tipo)
      .limit(1)
      .maybeSingle();
    if (existente) return { ok: true, data: existente as never };

    const { data, error } = await db
      .from("etiquetas")
      .insert({ nombre: limpio, tipo, creador: user.id })
      .select("id, nombre, tipo, plazo_dias")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as never };
  } catch (err) {
    return fail(err);
  }
}

export async function ponerEtiqueta(personaId: string, etiquetaId: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    const { error } = await db
      .from("etiquetas_persona")
      .upsert({ persona_id: personaId, etiqueta_id: etiquetaId, puesta_por: user.id }, { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    revalidatePath(`/contactos/${personaId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function quitarEtiqueta(personaId: string, etiquetaId: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    const { error } = await db
      .from("etiquetas_persona")
      .delete()
      .eq("persona_id", personaId)
      .eq("etiqueta_id", etiquetaId);
    if (error) throw new Error(error.message);
    revalidatePath(`/contactos/${personaId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ─── Ritual ──────────────────────────────────────────────────────────────────

/** Clasifica: pone las etiquetas elegidas y pasa la relación a «clasificada» (+1 punto). */
export async function clasificar(
  relacionId: string,
  personaId: string,
  etiquetaIds: string[],
): Promise<ActionResult<{ añadidas: string[] }>> {
  try {
    if (etiquetaIds.length === 0) return { ok: false, error: "Elige al menos una etiqueta" };
    const { db, user } = await getCrm();

    const { data: yaPuestas } = await db
      .from("etiquetas_persona")
      .select("etiqueta_id")
      .eq("persona_id", personaId)
      .in("etiqueta_id", etiquetaIds);
    const existentes = new Set((yaPuestas ?? []).map((r) => r.etiqueta_id as string));
    const añadidas = etiquetaIds.filter((id) => !existentes.has(id));

    if (añadidas.length > 0) {
      const { error } = await db
        .from("etiquetas_persona")
        .insert(añadidas.map((id) => ({ persona_id: personaId, etiqueta_id: id, puesta_por: user.id })));
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("relaciones").update({ estado: "clasificada" }).eq("id", relacionId);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, data: { añadidas } };
  } catch (err) {
    return fail(err);
  }
}

/** Tarjeta «Evento»: archiva de golpe a los asistentes nuevos de una reunión grande (archivar no puntúa). */
export async function archivarVarias(relacionIds: string[]): Promise<ActionResult<{ archivadas: number }>> {
  try {
    if (relacionIds.length === 0) return { ok: true, data: { archivadas: 0 } };
    const { db } = await getCrm();
    const { data, error } = await db
      .from("relaciones")
      .update({ estado: "archivada" })
      .in("id", relacionIds)
      .eq("estado", "nueva")
      .select("id");
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, data: { archivadas: data?.length ?? 0 } };
  } catch (err) {
    return fail(err);
  }
}

/** Deshace la última clasificación/archivo del ritual (−1 punto vía trigger). */
export async function deshacer(
  relacionId: string,
  personaId: string,
  etiquetasAñadidas: string[],
): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    if (etiquetasAñadidas.length > 0) {
      const { error } = await db
        .from("etiquetas_persona")
        .delete()
        .eq("persona_id", personaId)
        .in("etiqueta_id", etiquetasAñadidas);
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("relaciones").update({ estado: "nueva" }).eq("id", relacionId);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ─── Hitos ───────────────────────────────────────────────────────────────────

export async function crearHito(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, user } = await getCrm();
    const nombre = texto(formData.get("nombre"));
    if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
    const ambito = texto(formData.get("ambito")) === "personal" ? "personal" : "general";
    const { data, error } = await db
      .from("hitos")
      .insert({
        nombre,
        tipo: texto(formData.get("tipo")) || null,
        ambito,
        fecha: texto(formData.get("fecha")) || null,
        etiquetas_filtro: formData.getAll("etiquetas").map(String),
        abierto_por: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/hitos");
    return { ok: true, data: { id: data.id as string } };
  } catch (err) {
    return fail(err);
  }
}

export async function eliminarHito(hitoId: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    exigirFilas(await db.from("hitos").delete().eq("id", hitoId).select("id"), "Hito");
    revalidatePath("/hitos");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function incluirEnHito(hitoId: string, personaIds: string[]): Promise<ActionResult> {
  try {
    if (personaIds.length === 0) return { ok: true };
    const { db, user } = await getCrm();
    const { error } = await db
      .from("hito_persona")
      .upsert(
        personaIds.map((id) => ({ hito_id: hitoId, persona_id: id, incluida_por: user.id })),
        { ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    revalidatePath(`/hitos/${hitoId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function quitarDeHito(hitoId: string, personaId: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    exigirFilas(await db.from("hito_persona").delete().eq("hito_id", hitoId).eq("persona_id", personaId).select("persona_id"), "Invitado");
    revalidatePath(`/hitos/${hitoId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Pte → Contactado. Quién y cuándo lo fija la base (trigger hito_persona_before),
 * el cliente solo manda estado y canal. Dispara el alta/actualización en Zoho.
 */
export async function marcarContactado(hitoId: string, personaId: string, canal: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!(CANALES as readonly string[]).includes(canal)) return { ok: false, error: "Canal no válido" };
    const { data, error } = await db
      .from("hito_persona")
      .update({ estado: "contactado", canal })
      .eq("hito_id", hitoId)
      .eq("persona_id", personaId)
      .eq("estado", "pte")
      .select("persona_id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "No puedes modificar este invitado" };
    // Zoho no bloquea: si falla, queda anotado en hito_persona.zoho_estado.
    await registrarContactoEnZoho({ hitoId, personaId, empleadoEmail: user.email });
    revalidatePath(`/hitos/${hitoId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Reintenta el paso a Zoho de un contacto ya marcado como Contactado. */
export async function reintentarZoho(hitoId: string, personaId: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    // Validación por RLS: solo si el empleado ve esa fila del hito.
    const { data } = await db.from("hito_persona").select("estado").eq("hito_id", hitoId).eq("persona_id", personaId).maybeSingle();
    if (!data || data.estado !== "contactado") return { ok: false, error: "No está marcado como Contactado" };
    const res = await registrarContactoEnZoho({ hitoId, personaId, empleadoEmail: user.email });
    revalidatePath(`/hitos/${hitoId}`);
    return res.estado === "error" ? { ok: false, error: res.error ?? "Error de Zoho" } : { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function volverAPendiente(hitoId: string, personaId: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    // Solo quien lo contactó (o un admin) puede revertirlo: lo comprueba el trigger.
    exigirFilas(
      await db.from("hito_persona").update({ estado: "pte" }).eq("hito_id", hitoId).eq("persona_id", personaId).select("persona_id"),
      "Invitado",
    );
    revalidatePath(`/hitos/${hitoId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ─── Bolsa común y administración ────────────────────────────────────────────

export async function adoptarRelacion(relacionId: string): Promise<ActionResult> {
  try {
    const { db } = await getCrm();
    const { error } = await db.rpc("adoptar_relacion", { p_relacion: relacionId });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function fusionarEtiquetas(origenId: string, destinoId: string): Promise<ActionResult> {
  try {
    if (!origenId || !destinoId || origenId === destinoId) {
      return { ok: false, error: "Elige dos etiquetas distintas" };
    }
    const { db } = await getCrm();
    const { error } = await db.rpc("fusionar_etiquetas", { p_origen: origenId, p_destino: destinoId });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function cambiarPlazo(etiquetaId: string, plazoDias: number): Promise<ActionResult> {
  try {
    if (!Number.isInteger(plazoDias) || plazoDias < 1) return { ok: false, error: "Plazo no válido" };
    const { db } = await getCrm();
    exigirFilas(await db.from("etiquetas").update({ plazo_dias: plazoDias }).eq("id", etiquetaId).select("id"), "Etiqueta");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function convertirEnGeneral(etiquetaId: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    const { error } = await db.from("etiquetas").update({ tipo: "general" }).eq("id", etiquetaId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function marcarBonoEntregado(bonoId: string, entregado: boolean): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    exigirFilas(
      await db.from("bonos").update({ estado: entregado ? "entregado" : "pendiente" }).eq("id", bonoId).neq("estado", "anulado").select("id"),
      "Bono",
    );
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Anula un bono (sigue contando para no volver a emitirlo). Para puntos conseguidos de forma indebida. */
export async function anularBono(bonoId: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    exigirFilas(await db.from("bonos").update({ estado: "anulado" }).eq("id", bonoId).select("id"), "Bono");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Parámetros numéricos editables. Enteros: un decimal rompía el trigger de puntos (::integer). */
const CONFIG_EDITABLE: Record<string, { entero: boolean }> = {
  plazo_defecto_dias: { entero: true },
  puntos_por_bono: { entero: true },
  evento_umbral_externos: { entero: true },
  importe_bono: { entero: false },
};

export async function guardarConfig(clave: string, valor: number): Promise<ActionResult> {
  try {
    const def = CONFIG_EDITABLE[clave];
    if (!def) return { ok: false, error: "Parámetro desconocido" };
    if (!Number.isFinite(valor) || valor <= 0 || (def.entero && !Number.isInteger(valor))) {
      return { ok: false, error: def.entero ? "Tiene que ser un número entero mayor que 0" : "Tiene que ser mayor que 0" };
    }
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    const { error } = await db.from("config").upsert({ clave, valor, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function guardarPermiso(formData: FormData): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    const email = texto(formData.get("email"));
    const userId = email ? await resolveAuthUserIdByEmail(email) : null;
    if (!userId) return { ok: false, error: "No hay ningún usuario de icam con ese email" };
    const { error } = await db.from("permisos").upsert({
      user_id: userId,
      es_admin: formData.get("es_admin") === "on",
      ve_bolsa: formData.get("ve_bolsa") === "on",
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function quitarPermiso(userId: string): Promise<ActionResult> {
  try {
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    if (userId === user.id) return { ok: false, error: "No puedes quitarte tus propios permisos" };
    exigirFilas(await db.from("permisos").delete().eq("user_id", userId).select("user_id"), "Permiso");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ─── Integraciones (administración) ─────────────────────────────────────────

/** Envía el resumen semanal SOLO al propio administrador, para ver cómo queda. */
export async function enviarmeResumenPrueba(): Promise<ActionResult<{ enviado: boolean }>> {
  try {
    const { user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    const datos = await datosResumen({ id: user.id, email: user.email, nombre: user.name });
    // Aunque no haya nada pendiente, la prueba se envía para poder ver el formato.
    const { subject, html } = plantillaResumen(datos);
    const asunto = datos.pendientes === 0 && datos.vencidos.length === 0 ? "ImparComm · sin pendientes" : subject;
    await sendGraphMail({ to: user.email, subject: `[Prueba] ${asunto}`, html });
    return { ok: true, data: { enviado: true } };
  } catch (err) {
    return fail(err);
  }
}

/** Sincroniza ahora el calendario del propio administrador (últimos 30 días + 14). */
export async function sincronizarMiCalendario(): Promise<
  ActionResult<{ nuevas: number; reuniones: number; firmas: number | null }>
> {
  try {
    const { user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    if (!flags.calendario) return { ok: false, error: "CALENDARIO_ENABLED no está activo" };
    const ahora = Date.now();
    const empleado = { id: user.id, email: user.email, nombre: user.name };
    const r = await sincronizarEmpleado(
      empleado,
      new Date(ahora - 30 * 86_400_000),
      new Date(ahora + 14 * 86_400_000),
    );
    const firmas = flags.firmas ? (await completarFirmas(empleado)).actualizadas : null;
    revalidatePath("/", "layout");
    return { ok: true, data: { nuevas: r.relacionesNuevas, reuniones: r.conExternos, firmas } };
  } catch (err) {
    return fail(err);
  }
}

function parsearDominios(texto: string): string[] | null {
  const dominios = [...new Set(texto.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
  if (dominios.length === 0 || dominios.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) return null;
  return dominios;
}

/**
 * Cuántos contactos del calendario se borrarían al declarar internos estos
 * dominios. También rechaza dominios de correo personal (gmail.com borraría
 * media agenda). Se muestra antes de guardar.
 */
export async function previsualizarDominiosInternos(texto: string): Promise<ActionResult<{ purgadas: number }>> {
  try {
    const dominios = parsearDominios(texto);
    if (!dominios) return { ok: false, error: "Indica al menos un dominio válido" };
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    const { data, error } = await db.rpc("contar_purga_dominios", { p_dominios: dominios });
    if (error) throw new Error(error.message);
    return { ok: true, data: { purgadas: (data as number) ?? 0 } };
  } catch (err) {
    return fail(err);
  }
}

export async function guardarDominiosInternos(texto: string): Promise<ActionResult<{ purgadas: number }>> {
  try {
    const dominios = parsearDominios(texto);
    if (!dominios) return { ok: false, error: "Indica al menos un dominio válido" };
    const { db, user } = await getCrm();
    if (!user.isAdmin) return { ok: false, error: "No autorizado" };
    // Valida (dominios personales) antes de tocar nada.
    const { error: ev } = await db.rpc("contar_purga_dominios", { p_dominios: dominios });
    if (ev) throw new Error(ev.message);
    const { error } = await db.from("config").upsert({ clave: "dominios_internos", valor: dominios, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    // Lo capturado antes de declarar internos esos dominios deja de ser un contacto.
    const { data: purgadas, error: ep } = await db.rpc("purgar_dominios_internos");
    if (ep) throw new Error(ep.message);
    revalidatePath("/", "layout");
    return { ok: true, data: { purgadas: (purgadas as number) ?? 0 } };
  } catch (err) {
    return fail(err);
  }
}
