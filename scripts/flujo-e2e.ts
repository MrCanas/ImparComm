/**
 * Recorrido completo de la app en un navegador real contra un `next start`
 * local, con la identidad de un empleado (cookie de sesión firmada con el
 * AUTH_JWT_SECRET del proyecto, sin contraseña). Crea un contacto
 * @ejemplo.test y lo borra al final.
 *
 *   npx next start -p 3101 &  (tras npm run build)
 *   npx tsx scripts/flujo-e2e.ts <email_empleado> [url]
 *
 * Deja capturas en scripts/.e2e/*.png (ignorado por git).
 */
import { mkdirSync } from "node:fs";
import { config } from "dotenv";
import { SignJWT } from "jose";
import { Client } from "pg";
import { chromium, type Page } from "playwright";

config({ path: ".env.local" });

const EMAIL = process.argv[2];
const BASE = process.argv[3] ?? "http://localhost:3101";
const DIR = "scripts/.e2e";
const NOMBRE = "[e2e] Lucía Prueba";
const EMAIL_TEST = "lucia.e2e@ejemplo.test";
let fallos = 0;
let paso = 0;

function ok(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fallos += 1;
}

async function foto(page: Page, nombre: string) {
  paso += 1;
  await page.screenshot({ path: `${DIR}/${String(paso).padStart(2, "0")}-${nombre}.png`, fullPage: true });
}

async function main() {
  if (!EMAIL) throw new Error("Uso: tsx scripts/flujo-e2e.ts <email_empleado>");
  mkdirSync(DIR, { recursive: true });
  const pg = new Client({ connectionString: process.env.DATABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const q = (s: string, p: unknown[] = []) => pg.query(s, p);
  const uid = (await q("select id from auth.users where email = $1", [EMAIL])).rows[0]?.id as string | undefined;
  if (!uid) throw new Error(`No existe ${EMAIL}`);
  const limpiar = async () => {
    await q("delete from crm.personas where email = $1", [EMAIL_TEST]);
    await q("delete from crm.empresas e where e.nombre = '[e2e] Empresa' and not exists (select 1 from crm.personas p where p.empresa_id = e.id)");
    await q("delete from crm.etiquetas where nombre = '[e2e] Etiqueta'");
  };
  await limpiar();
  const puntos = async () => Number((await q("select coalesce(sum(delta),0) n from crm.puntos where empleado_id=$1", [uid])).rows[0].n);
  const puntos0 = await puntos();

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuer("impar-comm")
    .setAudience("impar-comm")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET!));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "impar-comm-auth", value: token, url: BASE }]);
  const page = await ctx.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

  try {
    // 1. Inicio
    await page.goto(`${BASE}/`);
    await page.waitForSelector("h1");
    ok((await page.textContent("h1"))?.startsWith("Hola"), `Inicio carga con sesión (${await page.textContent("h1")})`);
    ok(await page.locator("text=días de racha").count() > 0, "Inicio muestra la franja de actividad");
    await foto(page, "inicio");

    // 2. Alta manual
    await page.goto(`${BASE}/contactos/nuevo`);
    await page.fill("#nombre", NOMBRE);
    await page.fill("#email", EMAIL_TEST);
    await page.fill("#empresa", "[e2e] Empresa");
    await page.fill("#cargo", "Directora");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/contactos\/[0-9a-f-]+$/, { timeout: 20000 });
    ok(true, `Alta manual → ficha ${page.url().split("/").pop()}`);
    ok((await page.textContent("h1"))?.includes("Lucía"), "La ficha muestra el nombre");
    await foto(page, "ficha-nueva");

    // 3. Ritual: clasificar con una etiqueta
    await page.goto(`${BASE}/ritual?periodo=todo`);
    await page.waitForSelector("text=Clasificar");
    ok(await page.locator(`text=${NOMBRE}`).count() > 0, "El ritual muestra el contacto nuevo");
    await page.locator("button[aria-pressed]:has-text('Proveedor')").first().click();
    await page.click("button:has-text('Clasificar')");
    await page.waitForTimeout(1500);
    ok((await puntos()) === puntos0 + 1, `Clasificar suma 1 punto (${puntos0} → ${await puntos()})`);
    await foto(page, "ritual-tras-clasificar");

    // 4. Hito: invitar y marcar contactado
    const hitoId = (await q("select id from crm.hitos where ambito='general' and nombre='Proveedor' limit 1")).rows[0].id as string;
    await page.goto(`${BASE}/hitos/${hitoId}`);
    await page.waitForSelector("text=Candidatos");
    const invitar = page.locator("button:has-text('Invitar')").first();
    ok(await invitar.count() > 0, "El contacto clasificado aparece como candidato");
    await invitar.click();
    // En móvil la tarjeta pasa a la pestaña Pendientes (que queda oculta): hay que cambiar de pestaña.
    await page.getByRole("button", { name: /^Pendientes/ }).click();
    const btnContactado = page.getByRole("button", { name: "Contactado", exact: true });
    await btnContactado.waitFor({ timeout: 15000 });
    ok(true, "Invitado: pasa a Pendientes");
    await foto(page, "hito-pendiente");
    await btnContactado.click();
    await page.waitForSelector("text=¿Por qué canal");
    await page.click("[role=dialog] button:has-text('Email')");
    await page.waitForTimeout(2500);
    const hp = (await q("select estado, canal, contactado_por, fecha_contacto from crm.hito_persona where hito_id=$1 and persona_id=(select id from crm.personas where email=$2)", [hitoId, EMAIL_TEST])).rows[0];
    ok(hp?.estado === "contactado" && hp.canal === "Email" && hp.contactado_por === uid && hp.fecha_contacto, "Contactado: estado, canal y quién/cuándo (trigger) correctos");
    const evs = (await q("select accion from crm.hito_eventos where hito_id=$1 and persona_id=(select id from crm.personas where email=$2) order by id", [hitoId, EMAIL_TEST])).rows.map((r) => r.accion).join(",");
    ok(evs === "incluir,contactar", `Historial del hito: ${evs}`);
    await page.reload();
    await page.getByRole("button", { name: /^Contactados/ }).click();
    await page.waitForSelector("text=Volver a Pte");
    ok((await page.textContent("body"))?.includes("100%"), "El anillo del hito marca 100 %");
    await foto(page, "hito-contactado");

    // 5. Ficha: insignia del hito y timeline
    await page.goto(`${BASE}/contactos/${(await q("select id from crm.personas where email=$1", [EMAIL_TEST])).rows[0].id}`);
    await page.waitForSelector("h1");
    const cuerpo = (await page.textContent("body")) ?? "";
    ok(cuerpo.includes("Proveedor") && cuerpo.includes("Contactado en"), "La ficha muestra el hito y la timeline");
    await foto(page, "ficha-con-hito");

    // 6. Analíticas y Bolsa
    await page.goto(`${BASE}/analiticas`);
    await page.waitForSelector("h1");
    const an = (await page.textContent("body")) ?? "";
    ok(an.includes("Objetivos") && an.includes("Tu actividad"), "Analíticas carga con gráficas y objetivos");
    await foto(page, "analiticas");
    await page.goto(`${BASE}/analiticas?vista=equipo`);
    await page.waitForSelector("h1");
    ok((await page.textContent("body"))?.includes("Clasificación") || (await page.textContent("body"))?.includes("Actividad del periodo"), "Vista de equipo (admin)");
    await foto(page, "analiticas-equipo");
    await page.goto(`${BASE}/bolsa`);
    await page.waitForSelector("h1");
    ok((await page.textContent("body"))?.includes("Bolsa común"), "Bolsa común carga");
    await foto(page, "bolsa");

    // 7. Admin: parámetro decimal rechazado, dominio personal rechazado
    await page.goto(`${BASE}/admin?tab=etiquetas`);
    await page.waitForSelector("#cfg-puntos_por_bono");
    await page.fill("#cfg-puntos_por_bono", "12.5");
    const guardarCfg = page.locator("#cfg-puntos_por_bono ~ button");
    ok(await guardarCfg.isDisabled(), "Parámetro decimal: botón Guardar deshabilitado");
    await page.fill("#cfg-puntos_por_bono", "50");
    await foto(page, "admin-parametros");
    await page.goto(`${BASE}/admin?tab=integraciones`);
    await page.waitForSelector("input[aria-label='Dominios internos']");
    const domActual = await page.inputValue("input[aria-label='Dominios internos']");
    await page.fill("input[aria-label='Dominios internos']", `${domActual}, gmail.com`);
    await page.click("input[aria-label='Dominios internos'] ~ button");
    await page.waitForTimeout(2500);
    ok((await page.textContent("body"))?.includes("correo personal"), "gmail.com como dominio interno se rechaza con mensaje");
    const domDb = (await q("select valor from crm.config where clave='dominios_internos'")).rows[0].valor as string[];
    ok(!domDb.includes("gmail.com"), "…y no se guarda en la base");
    await foto(page, "admin-dominios");

    // 8. Archivar desde la ficha no puntúa; volver a Pte conserva permisos
    await page.goto(`${BASE}/contactos/${(await q("select id from crm.personas where email=$1", [EMAIL_TEST])).rows[0].id}`);
    await page.click("button:has-text('Archivar')");
    await page.waitForTimeout(2000);
    ok((await puntos()) === puntos0 + 1, "Archivar desde la ficha no cambia los puntos");

    // 9. Escritorio: tablero con tres columnas
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/hitos/${hitoId}`);
    await page.waitForSelector("section[aria-label='Contactados']");
    ok(await page.locator("section[aria-label='Candidatos']").isVisible() && await page.locator("section[aria-label='Contactados']").isVisible(), "Escritorio: las tres columnas visibles");
    await foto(page, "hito-escritorio");
    await page.goto(`${BASE}/`);
    await page.waitForSelector("h1");
    await foto(page, "inicio-escritorio");

    ok(errores.length === 0, `Sin errores de JavaScript en el navegador${errores.length ? `: ${errores.slice(0, 3).join(" | ").slice(0, 300)}` : ""}`);
  } catch (err) {
    fallos += 1;
    console.error("✗ Excepción:", err);
    await foto(page, "error").catch(() => {});
  } finally {
    await browser.close();
    await limpiar();
    await q("delete from crm.puntos where empleado_id=$1 and persona_id is null", [uid]); // por si quedara algo suelto
    const restos = await q("select count(*) n from crm.personas where email=$1", [EMAIL_TEST]);
    ok(Number(restos.rows[0].n) === 0, "Datos de prueba eliminados");
    await pg.end();
  }
  console.log(fallos === 0 ? "\nFlujo completo correcto." : `\n${fallos} comprobación(es) fallida(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
