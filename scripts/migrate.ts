/**
 * Aplica las migraciones de db/migrations/*.sql sobre el Supabase compartido.
 *
 * No usamos `supabase db push` porque el historial de migraciones de ese
 * proyecto lo gestiona el repo de icam web dashboard. Las de ImparComm viven en
 * el esquema `crm` y se registran en crm.schema_migrations.
 *
 *   npm run db:migrate            → aplica las pendientes
 *   npm run db:migrate -- --dry   → solo lista las pendientes
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const DIR = path.resolve(__dirname, "..", "db", "migrations");
const dryRun = process.argv.includes("--dry");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL en .env.local");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS crm");
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm.schema_migrations (
        nombre     text PRIMARY KEY,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query("REVOKE ALL ON crm.schema_migrations FROM anon, authenticated");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT nombre FROM crm.schema_migrations",
    );
    const aplicadas = new Set(rows.map((r) => r.nombre));
    const pendientes = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => !aplicadas.has(f));

    if (pendientes.length === 0) {
      console.log("Sin migraciones pendientes.");
      return;
    }

    for (const fichero of pendientes) {
      if (dryRun) {
        console.log(`[pendiente] ${fichero}`);
        continue;
      }
      const sql = readFileSync(path.join(DIR, fichero), "utf8");
      console.log(`Aplicando ${fichero}…`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO crm.schema_migrations (nombre) VALUES ($1)", [fichero]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("Migraciones aplicadas.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
