/**
 * Recorrido completo del módulo Eventos en un navegador real contra un
 * `next start` local. SOLO envía a direcciones @yopmail.com (modo prueba).
 * Crea un evento «[e2e] …» y lo borra al final.
 *
 *   npm run build
 *   (EVENTOS_URL=http://localhost:3101) npx next start -p 3101
 *   npx tsx scripts/eventos/e2e-eventos.ts [url]
 *
 * Capturas en scripts/.e2e/eventos-*.png (ignorado por git).
 */
import { mkdirSync } from "node:fs";

import { config } from "dotenv";
import { SignJWT } from "jose";
import { Client } from "pg";
import { chromium, type Page } from "playwright";

import { tokenInvitado } from "../../src/lib/eventos/tokens";

config({ path: ".env.local" });

const BASE = process.argv[2] ?? "http://localhost:3101";
const DIR = "scripts/.e2e";
const NOMBRE = `[e2e] Navidad ${Date.now()}`;
const PREFIJO = `impar-e2e-${Date.now().toString(36)}`;
let fallos = 0;
let paso = 0;

function ok(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fallos += 1;
}
async function foto(page: Page, nombre: string) {
  paso += 1;
  await page.screenshot({ path: `${DIR}/eventos-${String(paso).padStart(2, "0")}-${nombre}.png`, fullPage: true });
}
function localMadrid(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const pg = new Client({ connectionString: process.env.DATABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const q = (s: string, p: unknown[] = []) => pg.query(s, p);
  const admin = (await q(`SELECT user_id FROM crm.permisos WHERE es_admin UNION SELECT user_id FROM public.app_user_account WHERE is_platform_admin LIMIT 1`)).rows[0]?.user_id as string;
  if (!admin) throw new Error("No hay administrador");
  const modo = (await q("SELECT modo_prueba FROM crm.eventos_ajustes")).rows[0].modo_prueba;
  if (!modo) throw new Error("ABORTADO: el modo prueba no está activo");

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin)
    .setIssuer("impar-comm")
    .setAudience("impar-comm")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET!));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "es-ES", reducedMotion: "reduce", acceptDownloads: true });
  await ctx.addCookies([{ name: "impar-comm-auth", value: jwt, url: BASE }]);
  const page = await ctx.newPage();
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("dialog", (d) => void d.accept());

  let eventoId = "";
  try {
    // 1. Crear evento
    const inicio = new Date(Date.now() + 30 * 86400_000);
    inicio.setUTCHours(18, 30, 0, 0);
    await page.goto(`${BASE}/eventos?nuevo=1`);
    await page.fill("#nombre", NOMBRE);
    await page.fill("#inicio", localMadrid(inicio));
    await page.fill("#fin", localMadrid(new Date(inicio.getTime() + 3 * 3600_000)));
    await page.fill("#lugar", "Lugar e2e");
    await page.fill("#direccion", "Calle Prueba 1, Madrid");
    await page.fill("#aforo", "10");
    await page.click("button:has-text('Crear evento')");
    await page.waitForURL(/\/eventos\/[0-9a-f-]{36}$/, { timeout: 20000 });
    eventoId = page.url().split("/").pop()!;
    ok(eventoId, "crea el evento");
    await page.goto(`${BASE}/eventos/${eventoId}?tab=ajustes`);
    await page.selectOption("#estado", "activo");
    await page.click("button:has-text('Guardar cambios')");
    await page.waitForSelector("text=Guardado.");
    ok((await q("SELECT estado FROM crm.eventos WHERE id=$1", [eventoId])).rows[0].estado === "activo", "evento activado");

    // 2. Importar invitados
    const emails = Array.from({ length: 5 }, (_, i) => `${PREFIJO}-${i + 1}@yopmail.com`);
    const csv = [
      "Email;Nombre;Apellidos;Empresa;Etiquetas",
      ...emails.map((e, i) => `${e};Invitado${i + 1};Prueba Ñúñez;Empresa ${i % 2 ? "B" : "A"};${i < 3 ? "VIP" : "General"}`),
      `${emails[0]!.toUpperCase()};Duplicado;;;`,
      "esto-no-es-un-email;Malo;;;",
    ].join("\n");
    await page.goto(`${BASE}/eventos/${eventoId}?tab=invitados`);
    await page.fill("textarea[placeholder^='…o pega']", csv);
    await page.click("button:has-text('Analizar')");
    await page.waitForSelector("text=Informe previo", { timeout: 60000 });
    const informe = await page.textContent("div:has(> p:has-text('Informe previo'))");
    ok(/Se añadirán: 5/.test(informe ?? ""), "informe: 5 se añadirán");
    ok(/Duplicados dentro del fichero \(se ignoran\): 1/.test(informe ?? ""), "informe: 1 duplicado");
    ok(/Emails no válidos \(se descartan\): 1/.test(informe ?? ""), "informe: 1 inválido");
    ok(Number((await q("SELECT count(*) FROM crm.evento_invitados WHERE evento_id=$1", [eventoId])).rows[0].count) === 0, "el análisis no guarda nada");
    await foto(page, "informe-importacion");
    await page.click("button:has-text('Confirmar carga de 5')");
    await page.waitForSelector("text=5 invitados añadidos.", { timeout: 30000 });
    const inv = (await q("SELECT id, email, nombre, etiquetas FROM crm.evento_invitados WHERE evento_id=$1 ORDER BY email", [eventoId])).rows;
    ok(inv.length === 5 && inv[0].nombre === "Invitado1 Prueba Ñúñez" && inv[0].etiquetas[0] === "VIP", "5 invitados guardados con nombre, tildes y etiquetas");

    // 3. Plantilla de invitación
    await page.goto(`${BASE}/eventos/${eventoId}?tab=plantillas`);
    await page.click("button:has-text('Nueva plantilla')");
    await page.waitForURL(/plantillas\/[0-9a-f-]{36}$/, { timeout: 20000 });
    const plantillaId = page.url().split("/").pop()!;
    await page.waitForSelector("iframe[title='Vista previa']", { timeout: 20000 });
    ok(await page.locator("text=Revisión sin problemas").count(), "plantilla base sin errores de revisión");
    const asunto = page.locator("#pl-asunto");
    await asunto.fill("[e2e] {{nombre|Hola}}, te invitamos (v2)");
    await page.click("button:has-text('Guardar')");
    await page.waitForSelector("text=Guardado (versión 2)", { timeout: 20000 });
    ok(true, "guardar sube a la versión 2");
    await page.fill("#pl-destino", `${PREFIJO}-prueba@yopmail.com`);
    await page.click("button:has-text('Enviar prueba')");
    await page.waitForSelector(`text=Enviado`, { timeout: 30000 });
    ok(true, "envío de prueba aceptado por Microsoft");
    await page.fill("#pl-destino", "alguien@imparcapital.com");
    await page.click("button:has-text('Enviar prueba')");
    await page.waitForSelector("text=solo pueden ir a direcciones @yopmail.com", { timeout: 15000 });
    ok(true, "la prueba a una dirección real se bloquea");
    await foto(page, "editor");

    // 4. Envío con pausa, cambio de plantilla y reanudación
    await page.goto(`${BASE}/eventos/${eventoId}?tab=envios&nuevo=1`);
    await page.fill("input[placeholder='Piloto 50 · Invitación']", "[e2e] Piloto");
    await page.fill("label:has-text('Segundos entre correos') + input", "4");
    await page.fill("label:has-text('Máximo de destinatarios') + input", "4");
    await page.waitForTimeout(1200);
    await page.click("button:has-text('Crear envío')");
    await page.waitForURL(/envios\/[0-9a-f-]{36}$/, { timeout: 20000 });
    const envioId = page.url().split("/").pop()!;
    ok((await q("SELECT count(*) FROM crm.envio_destinatarios WHERE envio_id=$1", [envioId])).rows[0].count === "0", "crear el envío no envía nada");
    await page.click("button:has-text('Iniciar envío')");
    await page.waitForSelector("text=Para confirmar escribe");
    await page.fill("input[placeholder='ENVIAR 4']", "ENVIAR 4");
    await page.click("button:has-text('Confirmar')");
    await page.waitForSelector("text=Enviado a", { timeout: 30000 });
    await page.click("button:has-text('Pausar')");
    await page.waitForSelector("text=Pausado.", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const tras = (await q("SELECT estado, count(*)::int n FROM crm.envio_destinatarios WHERE envio_id=$1 GROUP BY estado", [envioId])).rows;
    const enviados1 = tras.find((r) => r.estado === "enviado")?.n ?? 0;
    ok(enviados1 >= 1 && enviados1 < 4, `pausa a mitad (${enviados1} de 4 enviados)`);
    ok((await q("SELECT estado FROM crm.envios WHERE id=$1", [envioId])).rows[0].estado === "pausado", "envío en pausa");
    await foto(page, "consola-pausa");

    // Mientras está en pausa: nueva versión de la plantilla
    await q("UPDATE crm.plantillas SET asunto = '[e2e] Invitación (v3)' WHERE id=$1", [plantillaId]);
    await page.reload();
    await page.click("button:has-text('Reanudar')");
    await page.waitForSelector("text=Para confirmar escribe");
    const restantes = 4 - enviados1;
    await page.fill(`input[placeholder='ENVIAR ${restantes}']`, `ENVIAR ${restantes}`);
    await page.click("button:has-text('Confirmar')");
    await page.waitForSelector("text=Envío completado", { timeout: 90000 });
    const dest = (await q("SELECT estado, plantilla_version FROM crm.envio_destinatarios WHERE envio_id=$1 ORDER BY orden", [envioId])).rows;
    ok(dest.length === 4 && dest.every((d) => d.estado === "enviado"), "4 enviados, ninguno duplicado ni perdido");
    ok(dest.slice(0, enviados1).every((d) => d.plantilla_version === 2) && dest.slice(enviados1).every((d) => d.plantilla_version === 3), "tras reanudar se usa la versión nueva de la plantilla");
    await foto(page, "consola-completado");

    // 5. Landing (sin sesión)
    const anon = await browser.newContext({ locale: "es-ES", acceptDownloads: true });
    const lp = await anon.newPage();
    const i1 = inv[0];
    const t1 = tokenInvitado(i1.id);
    await lp.goto(`${BASE}/e/${t1}?r=si`);
    await lp.waitForSelector("text=Confirmar respuesta");
    ok(await lp.locator(`h1:has-text('${NOMBRE.toUpperCase().slice(0, 10)}')`).count() || (await lp.textContent("h1"))?.includes("[e2e]"), "la landing muestra el evento");
    const r0 = (await q("SELECT respuesta, n_visitas FROM crm.evento_invitados WHERE id=$1", [i1.id])).rows[0];
    ok(r0.respuesta === null && r0.n_visitas >= 1, "abrir el enlace (con ?r=si) NO responde; solo cuenta la visita");
    await lp.check("input[name='acompanante']");
    await lp.fill("input[name='acompanante_nombre']", "Pareja Prueba");
    await lp.fill("input[name='telefono']", "600000000");
    await lp.click("button:has-text('Confirmar respuesta')");
    await lp.waitForSelector("text=Añádelo a tu calendario", { timeout: 20000 });
    const r1 = (await q("SELECT respuesta, acompanante, acompanante_nombre FROM crm.evento_invitados WHERE id=$1", [i1.id])).rows[0];
    ok(r1.respuesta === "si" && r1.acompanante && r1.acompanante_nombre === "Pareja Prueba", "respuesta Sí con acompañante guardada");
    await foto(lp, "landing-gracias");
    const ics = await anon.request.get(`${BASE}/ics/${t1}`);
    const icsTxt = await ics.text();
    ok(ics.status() === 200 && /text\/calendar/.test(ics.headers()["content-type"] ?? "") && /METHOD:PUBLISH/.test(icsTxt), "descarga del .ics individual");
    const malo = await anon.request.get(`${BASE}/e/${"x".repeat(43)}`);
    ok(malo.status() === 404, "token inexistente → 404");
    const interna = await anon.request.get(`${BASE}/eventos`, { maxRedirects: 0 });
    ok([302, 307].includes(interna.status()), "la app interna sigue exigiendo sesión");

    // 6. Baja
    const i2 = inv[1];
    await lp.goto(`${BASE}/baja/${tokenInvitado(i2.id)}`);
    ok((await q("SELECT count(*) FROM crm.bajas WHERE email=$1", [i2.email])).rows[0].count === "0", "abrir el enlace de baja no da de baja");
    await lp.click("button:has-text('Confirmar la baja')");
    await lp.waitForSelector("text=no volverás a recibir");
    ok((await q("SELECT count(*) FROM crm.bajas WHERE email=$1", [i2.email])).rows[0].count === "1", "baja registrada");
    await anon.close();

    // 7. Segmento de recordatorio: excluye a quien respondió y a la baja
    await page.goto(`${BASE}/eventos/${eventoId}?tab=envios&nuevo=1`);
    await page.selectOption("label:has-text('Excluir a quien ya recibió') + select", "");
    await page.waitForTimeout(1500);
    const vista = await page.textContent("div.rounded-md.bg-page.p-3.text-sm");
    ok(/^\s*3 destinatarios/.test(vista ?? "") && /1 excluidos/.test(vista ?? ""), `recordatorio «sin respuesta»: 3 destinatarios y la baja excluida (${(vista ?? "").slice(0, 80)})`);
    await foto(page, "segmento-recordatorio");

    // 8. Asistentes
    await page.goto(`${BASE}/eventos/${eventoId}?tab=asistentes`);
    ok(await page.locator("text=Pareja Prueba").count(), "la lista interna muestra el acompañante");
    const personas = await page.locator("p:has-text('Personas (sí)') + p").textContent();
    ok(personas?.trim() === "2", "asistentes: 1 confirmado + 1 acompañante = 2 personas");
    await foto(page, "asistentes");

    ok(errores.length === 0, `sin errores de JavaScript en la página${errores.length ? `: ${errores.join(" | ")}` : ""}`);
    console.log(`\nBuzones de prueba: https://yopmail.com/?${PREFIJO}-1  (y -2…-4, -prueba)`);
  } finally {
    if (eventoId) {
      await q("DELETE FROM crm.bajas WHERE email LIKE $1", [`${PREFIJO}%`]);
      await q("DELETE FROM crm.envios WHERE evento_id=$1", [eventoId]);
      await q("DELETE FROM crm.eventos WHERE id=$1", [eventoId]);
    }
    await browser.close();
    await pg.end();
  }
  console.log(fallos ? `\n${fallos} comprobaciones fallidas` : "\nTodo correcto (evento de prueba borrado).");
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
