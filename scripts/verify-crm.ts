/**
 * Verificación de punta a punta del esquema crm contra el Supabase real, con
 * la identidad de dos empleados (mismo bridge de tokens que usa la app, así
 * que RLS se comprueba de verdad). Crea datos @ejemplo.test y los borra al final.
 *
 *   npm run db:verify -- <email_admin> <email_empleado>
 *
 * El empleado debería ser una cuenta de prueba no admin (p. ej. @icam.local).
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMINIO = "ejemplo.test";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let fallos = 0;

function ok(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fallos += 1;
}

async function clienteDe(email: string): Promise<{ db: SupabaseClient<any, "crm">; id: string }> {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink ${email}: ${error.message}`);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (e2 || !s.session) throw new Error(`verifyOtp ${email}: ${e2?.message}`);
  const db = createClient(URL, ANON, {
    db: { schema: "crm" },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
  });
  return { db, id: s.user!.id };
}

async function puntosDe(db: SupabaseClient<any, "crm">, id: string) {
  const { data } = await db.from("puntos").select("delta").eq("empleado_id", id);
  return (data ?? []).reduce((s, p) => s + (p.delta as number), 0);
}

async function limpiar() {
  const c = admin.schema("crm");
  const { data: ps } = await c.from("personas").select("id").like("email", `%@${DOMINIO}`);
  const { data: emps } = await c.from("empresas").select("id").like("nombre", "[verify]%");
  const { data: ps2 } = emps?.length
    ? await c.from("personas").select("id").in("empresa_id", emps.map((e) => e.id))
    : { data: [] };
  const ids = [...new Set([...(ps ?? []), ...(ps2 ?? [])].map((p) => p.id))];
  if (ids.length) {
    await c.from("puntos").delete().in("persona_id", ids);
    await c.from("personas").delete().in("id", ids);
  }
  await c.from("hitos").delete().like("nombre", "[verify]%");
  await c.from("etiquetas").delete().like("nombre", "[verify]%");
  await c.from("empresas").delete().like("nombre", "[verify]%");
}

async function main() {
  const [emailA, emailB] = process.argv.slice(2);
  if (!emailA || !emailB) throw new Error("Uso: npm run db:verify -- <email_admin> <email_empleado>");

  await limpiar();
  const A = await clienteDe(emailA);
  const B = await clienteDe(emailB);
  const puntosB0 = await puntosDe(B.db, B.id);

  // 1. Alta manual y aislamiento
  const { data: p1, error: e1 } = await B.db.rpc("alta_manual", {
    p_nombre: "Prueba Uno", p_email: `uno@${DOMINIO}`, p_telefono: "", p_cargo: "CFO",
    p_empresa: "[verify] Empresa", p_notas: "nota privada",
  });
  ok(!e1 && p1, `B da de alta a una persona (${e1?.message ?? "ok"})`);
  const { data: p2 } = await A.db.rpc("alta_manual", {
    p_nombre: "Prueba Dos", p_email: `dos@${DOMINIO}`, p_telefono: "", p_cargo: "",
    p_empresa: "", p_notas: "",
  });
  const { data: sinContacto } = await B.db.rpc("alta_manual", {
    p_nombre: "Sin contacto", p_email: "", p_telefono: "", p_cargo: "", p_empresa: "", p_notas: "",
  }).then((r) => ({ data: r.error }));
  ok(sinContacto, "Alta sin email ni teléfono rechazada");

  const { data: relB } = await B.db.from("relaciones").select("id, persona_id, estado, notas");
  ok(relB?.length === 1 && relB[0].persona_id === p1, "B solo ve su relación");
  const { data: vistaP2 } = await B.db.from("personas").select("id").eq("id", p2);
  ok(vistaP2?.length === 0, "B no ve a la persona de A");
  const { data: relesA } = await A.db.from("relaciones").select("id").in("persona_id", [p1, p2]);
  ok(relesA?.length === 2, "El admin ve las relaciones de todos");

  // 2. Dedupe por email: A añade a la misma persona → misma persona, nueva relación
  const { data: p1bis } = await A.db.rpc("alta_manual", {
    p_nombre: "Prueba 1 (otro nombre)", p_email: `UNO@${DOMINIO}`, p_telefono: "600000000", p_cargo: "",
    p_empresa: "", p_notas: "",
  });
  ok(p1bis === p1, "Mismo email → misma persona (deduplicada)");

  // 3. Clasificar con etiqueta → punto y recordatorio a 30 días
  const { data: inversor } = await B.db.from("etiquetas").select("id").eq("nombre", "Potencial inversor").single();
  const { data: proveedor } = await B.db.from("etiquetas").select("id").eq("nombre", "Proveedor").single();
  await B.db.from("etiquetas_persona").insert([
    { persona_id: p1, etiqueta_id: inversor!.id, puesta_por: B.id },
    { persona_id: p1, etiqueta_id: proveedor!.id, puesta_por: B.id },
  ]);
  const relId = relB![0].id;
  await B.db.from("relaciones").update({ estado: "clasificada" }).eq("id", relId);
  const { data: r1 } = await B.db.from("relaciones").select("estado, proximo_recordatorio, created_at").eq("id", relId).single();
  const esperado = new Date(new Date(r1!.created_at).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  ok(r1!.proximo_recordatorio === esperado, `Recordatorio = plazo más corto (30 d): ${r1!.proximo_recordatorio}`);
  ok((await puntosDe(B.db, B.id)) === puntosB0 + 1, "Clasificar suma 1 punto");

  // 4. Deshacer resta; archivar suma; recuperar
  await B.db.from("relaciones").update({ estado: "nueva" }).eq("id", relId);
  ok((await puntosDe(B.db, B.id)) === puntosB0, "Deshacer resta el punto");
  await B.db.from("relaciones").update({ estado: "archivada" }).eq("id", relId);
  ok((await puntosDe(B.db, B.id)) === puntosB0 + 1, "Archivar puntúa igual que clasificar");
  await B.db.from("relaciones").update({ estado: "clasificada" }).eq("id", relId);
  ok((await puntosDe(B.db, B.id)) === puntosB0 + 1, "Recuperar archivado → clasificada no duplica puntos");

  // 5. Etiqueta personal invisible para otros (no admin)
  const { data: personal } = await B.db.from("etiquetas")
    .insert({ nombre: "[verify] mi etiqueta", tipo: "personal", creador: B.id }).select("id").single();
  ok(!!personal, "B crea una etiqueta personal");
  const { error: eSuplant } = await B.db.from("etiquetas")
    .insert({ nombre: "[verify] suplantada", tipo: "general", creador: A.id });
  ok(!!eSuplant, "No se puede crear una etiqueta en nombre de otro");

  // 6. Hito general, Pte → Contactado
  const { data: hito, error: eh } = await A.db.from("hitos")
    .insert({ nombre: "[verify] Hito", ambito: "general", abierto_por: A.id, etiquetas_filtro: [inversor!.id] })
    .select("id").single();
  ok(!eh && hito, "El admin abre un hito general");
  const { error: eIncl } = await B.db.from("hito_persona").insert({ hito_id: hito!.id, persona_id: p1, incluida_por: B.id });
  ok(!eIncl, `B incluye a su contacto en el hito (${eIncl?.message ?? "ok"})`);
  const { error: eAjena } = await B.db.from("hito_persona").insert({ hito_id: hito!.id, persona_id: p2, incluida_por: B.id });
  ok(!!eAjena, "B no puede incluir a una persona que no conoce");
  await B.db.from("hito_persona")
    .update({ estado: "contactado", canal: "Email", contactado_por: B.id, fecha_contacto: new Date().toISOString() })
    .eq("hito_id", hito!.id).eq("persona_id", p1);
  const { data: hpA } = await A.db.from("hito_persona").select("estado, contactado_por").eq("hito_id", hito!.id);
  ok(hpA?.[0]?.estado === "contactado" && hpA[0].contactado_por === B.id, "A ve «Contactado por B» (persona compartida)");
  const { data: nombres } = await A.db.rpc("empleados_display", { p_ids: [B.id] });
  ok((nombres as unknown[])?.length === 1, "Nombre del empleado resoluble para «Contactado por»");

  // 7. Resumen admin y bloqueo a no admin
  const { data: resumen, error: er } = await A.db.rpc("resumen_empleados");
  ok(!er && (resumen as { empleado_id: string }[]).some((r) => r.empleado_id === B.id), "Resumen por empleado (admin)");
  const { error: erB } = await B.db.rpc("resumen_empleados");
  ok(!!erB, "Un no admin no puede ver el resumen del equipo");

  // 8. Bolsa común (B está dado de baja en icam) → A adopta
  const { data: bolsa } = await A.db.rpc("bolsa_comun");
  const item = (bolsa as { relacion_id: string; persona_id: string }[] | null)?.find((x) => x.persona_id === p1);
  ok(!!item, "Las relaciones de un empleado de baja aparecen en la bolsa común");
  if (item) {
    const { error: ea } = await A.db.rpc("adoptar_relacion", { p_relacion: item.relacion_id });
    ok(!ea, `El admin adopta de la bolsa (${ea?.message ?? "ok"})`);
  }

  await limpiar();
  const { data: restos } = await admin.schema("crm").from("personas").select("id").like("email", `%@${DOMINIO}`);
  ok(restos?.length === 0, "Datos de prueba eliminados");

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallida(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limpiar().catch(() => {});
  process.exit(1);
});
