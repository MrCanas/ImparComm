/**
 * Prueba el motor de envío (funciones SQL de la migración 009) contra la base
 * real dentro de UNA transacción que se deshace al final: no deja nada.
 * Si la migración aún no está aplicada, la aplica dentro de la transacción.
 *
 *   npx tsx scripts/eventos/probar-motor-sql.ts
 */
import { readFileSync } from "node:fs";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

let fallos = 0;
function ok(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fallos++;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN");
    const { rows: ya } = await c.query("SELECT 1 FROM crm.schema_migrations WHERE nombre = '009_eventos.sql'");
    if (!ya.length) await c.query(readFileSync("db/migrations/009_eventos.sql", "utf8"));

    const { rows: admins } = await c.query<{ user_id: string }>(
      `SELECT user_id FROM crm.permisos WHERE es_admin
       UNION SELECT user_id FROM public.app_user_account WHERE is_platform_admin LIMIT 1`,
    );
    if (!admins.length) throw new Error("No hay ningún administrador para simular");
    const admin = admins[0]!.user_id;

    // Datos de prueba (como postgres)
    const ev = (await c.query(`INSERT INTO crm.eventos (nombre, slug, inicio, fin) VALUES ('[test] Evento', 'test-motor', now() + interval '30 days', now() + interval '30 days 3 hours') RETURNING id`)).rows[0].id;
    const pl = (await c.query(`INSERT INTO crm.plantillas (evento_id, tipo, nombre, asunto) VALUES ($1, 'invitacion', 'P', 'Asunto') RETURNING id, version`, [ev])).rows[0];
    ok(pl.version === 1, "plantilla nace en versión 1");
    await c.query(`UPDATE crm.plantillas SET asunto = 'Asunto 2' WHERE id = $1`, [pl.id]);
    const v2 = (await c.query(`SELECT version, (SELECT count(*) FROM crm.plantilla_versiones WHERE plantilla_id = $1) n FROM crm.plantillas WHERE id = $1`, [pl.id])).rows[0];
    ok(v2.version === 2 && Number(v2.n) === 2, "editar el contenido sube la versión y guarda instantánea");

    const ids: string[] = [];
    for (const [i, email] of ["a@yopmail.com", "b@yopmail.com", "baja@yopmail.com", "d@yopmail.com"].entries()) {
      ids.push((await c.query(`INSERT INTO crm.evento_invitados (evento_id, email, token_hash) VALUES ($1, $2, $3) RETURNING id`, [ev, email, `hash-${i}`])).rows[0].id);
    }
    await c.query(`INSERT INTO crm.bajas (email) VALUES ('baja@yopmail.com')`);
    const envio = (await c.query(`INSERT INTO crm.envios (evento_id, nombre, plantilla_id, delay_ms) VALUES ($1, 'E', $2, 5000) RETURNING id`, [ev, pl.id])).rows[0].id;

    // A partir de aquí, como el administrador (RLS + auth.uid()).
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin, role: "authenticated" })]);
    await c.query("SET LOCAL ROLE authenticated");

    const rpc = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows[0];
    const reservar = (s: string) => rpc(`SELECT crm.envio_reservar_siguiente($1, $2) r`, [envio, s]).then((x) => x.r);
    const S1 = "sesion-1-xxxxxxxxxxxx";
    const S2 = "sesion-2-xxxxxxxxxxxx";

    const fij = (await rpc(`SELECT crm.envio_fijar_destinatarios($1, $2::uuid[]) r`, [envio, ids])).r;
    ok(fij.nuevos === 4, "fija 4 destinatarios");

    ok((await reservar(S1)).status === "no_activo", "sin iniciar, no envía");
    await rpc(`SELECT crm.envio_cambiar_estado($1, 'en_curso')`, [envio]);

    let r = await reservar(S1);
    ok(r.status === "ok" && r.invitado_id === ids[0], "reserva el primero");
    ok(r.modo_prueba === true, "el modo prueba viene activo por defecto");
    ok((await reservar(S2)).status === "candado", "otra pestaña no puede enviar (candado)");
    ok((await reservar(S1)).status === "espera", "con una reserva abierta reciente, espera");
    await rpc(`SELECT crm.envio_resultado($1, $2, $3, 'enviado', 2)`, [envio, ids[0], S1]);

    r = await reservar(S1);
    ok(r.status === "espera" && r.espera_ms > 0, "respeta el delay entre correos");

    // Simulamos que pasa el tiempo (como postgres: el administrador no puede tocar envios.ultimo_envio_en)
    const comoPostgres = async (sql: string, p: unknown[]) => {
      await c.query("RESET ROLE");
      await c.query(sql, p);
      await c.query("SET LOCAL ROLE authenticated");
    };
    await comoPostgres(`UPDATE crm.envios SET ultimo_envio_en = now() - interval '10 seconds' WHERE id = $1`, [envio]);
    r = await reservar(S1);
    ok(r.status === "ok" && r.invitado_id === ids[1], "pasado el delay, reserva el segundo");

    // Corte: la reserva queda abierta y «pasa el tiempo» → incierto + pausa
    await comoPostgres(`UPDATE crm.envio_destinatarios SET reservado_en = now() - interval '5 minutes' WHERE envio_id = $1 AND estado = 'enviando'`, [envio]);
    await comoPostgres(`UPDATE crm.envios SET ultimo_envio_en = now() - interval '10 seconds' WHERE id = $1`, [envio]);
    ok((await reservar(S1)).status === "incierto", "reserva sin cerrar → incierto");
    const est = (await rpc(`SELECT estado, motivo_pausa FROM crm.envios WHERE id = $1`, [envio]));
    ok(est.estado === "pausado", "y el envío queda pausado");
    let bloqueado = false;
    try {
      await c.query("SAVEPOINT s1");
      await rpc(`SELECT crm.envio_cambiar_estado($1, 'en_curso')`, [envio]);
    } catch {
      bloqueado = true;
      await c.query("ROLLBACK TO SAVEPOINT s1");
    }
    ok(bloqueado, "no se puede reanudar con inciertos sin revisar");
    await rpc(`SELECT crm.envio_resolver_destinatario($1, $2, 'marcar_enviado')`, [envio, ids[1]]);
    await rpc(`SELECT crm.envio_cambiar_estado($1, 'en_curso')`, [envio]);

    await comoPostgres(`UPDATE crm.envios SET ultimo_envio_en = now() - interval '10 seconds' WHERE id = $1`, [envio]);
    r = await reservar(S2);
    ok(r.status === "ok" && r.invitado_id === ids[3], "tras reanudar (otra pestaña, candado liberado) se salta la baja y va al cuarto");
    const om = await rpc(`SELECT estado, error FROM crm.envio_destinatarios WHERE envio_id = $1 AND invitado_id = $2`, [envio, ids[2]]);
    ok(om.estado === "omitido" && om.error === "Baja", "la baja queda omitida");
    await rpc(`SELECT crm.envio_resultado($1, $2, $3, 'enviado', 2)`, [envio, ids[3], S2]);
    await comoPostgres(`UPDATE crm.envios SET ultimo_envio_en = now() - interval '10 seconds' WHERE id = $1`, [envio]);
    ok((await reservar(S2)).status === "completado", "sin pendientes → completado");

    const cuenta = await rpc(
      `SELECT count(*) FILTER (WHERE estado = 'enviado') env, count(*) FILTER (WHERE estado = 'omitido') om FROM crm.envio_destinatarios WHERE envio_id = $1`,
      [envio],
    );
    ok(Number(cuenta.env) === 3 && Number(cuenta.om) === 1, "3 enviados, 1 omitido, ningún duplicado");

    // El administrador no puede saltarse el motor cambiando el estado a mano
    let directo = false;
    try {
      await c.query("SAVEPOINT s2");
      await c.query(`UPDATE crm.envios SET estado = 'en_curso' WHERE id = $1`, [envio]);
    } catch {
      directo = true;
      await c.query("ROLLBACK TO SAVEPOINT s2");
    }
    ok(directo, "el estado del envío no se puede cambiar con un UPDATE directo");

    // Landing (service_role)
    await c.query("RESET ROLE");
    await c.query("SET LOCAL ROLE service_role");
    const resp = (await c.query(`SELECT crm.evento_responder('hash-0', 'si', true, ' Pareja ', '600', 'Hola') r`)).rows[0].r;
    ok(resp.ok === true, "la landing registra la respuesta");
    const inv = (await c.query(`SELECT respuesta, acompanante, acompanante_nombre FROM crm.evento_invitados WHERE id = $1`, [ids[0]])).rows[0];
    ok(inv.respuesta === "si" && inv.acompanante && inv.acompanante_nombre === "Pareja", "respuesta con acompañante guardada");
    const no = (await c.query(`SELECT crm.evento_responder('hash-0', 'no', true, 'X', null, null) r`)).rows[0].r;
    ok(no.ok, "se puede cambiar la respuesta");
    const inv2 = (await c.query(`SELECT acompanante, acompanante_nombre FROM crm.evento_invitados WHERE id = $1`, [ids[0]])).rows[0];
    ok(!inv2.acompanante && inv2.acompanante_nombre === null, "con «no» se borra el acompañante");
    ok((await c.query(`SELECT crm.evento_responder('no-existe', 'si', false, null, null, null) r`)).rows[0].r.ok === false, "token inexistente rechazado");

    await c.query("RESET ROLE");
    await c.query("SET LOCAL ROLE anon");
    let anonBloqueado = false;
    try {
      await c.query("SAVEPOINT s3");
      await c.query(`SELECT crm.evento_responder('hash-0', 'si', false, null, null, null)`);
    } catch {
      anonBloqueado = true;
      await c.query("ROLLBACK TO SAVEPOINT s3");
    }
    ok(anonBloqueado, "anon no puede llamar a las funciones de la landing");
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
  console.log(fallos ? `\n${fallos} comprobaciones fallidas` : "\nTodo correcto (transacción deshecha: no queda nada en la base).");
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
