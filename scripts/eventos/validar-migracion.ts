/**
 * Ejecuta una migración dentro de una transacción y la deshace (ROLLBACK) para
 * comprobar que es válida contra la base real sin dejar ningún cambio.
 *
 *   npx tsx scripts/eventos/validar-migracion.ts db/migrations/009_eventos.sql
 */
import { readFileSync } from "node:fs";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

async function main() {
  const fichero = process.argv[2];
  if (!fichero) throw new Error("Uso: validar-migracion.ts <fichero.sql>");
  const connectionString = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_POOLER_URL o DATABASE_URL");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(fichero, "utf8"));
    console.log(`✓ ${fichero} se aplica sin errores (se deshace: ROLLBACK).`);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
