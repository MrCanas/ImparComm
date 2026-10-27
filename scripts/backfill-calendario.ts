/**
 * Recarga histórica del calendario de un empleado (mismo camino que el cron,
 * pero con la ventana que se pida y sin borrar reuniones ausentes).
 *
 *   npx tsx scripts/backfill-calendario.ts <email> [dias=365] [--dry]
 *
 * --dry solo lee Graph y cuenta; no escribe en la base de datos.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const DIA_MS = 86_400_000;

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [email, diasArg] = args.filter((a) => a !== "--dry");
  if (!email) throw new Error("Uso: tsx scripts/backfill-calendario.ts <email> [dias] [--dry]");
  const dias = Number(diasArg ?? 365);

  const { empleadosActivos } = await import("@/lib/db/service");
  const { sincronizarEmpleado } = await import("@/lib/graph/calendario");
  const { graphFetch } = await import("@/lib/graph/client");

  const empleado = (await empleadosActivos()).find((e) => e.email.toLowerCase() === email.toLowerCase());
  if (!empleado) throw new Error(`${email} no es un empleado activo`);

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * DIA_MS);
  console.log(`${empleado.email} (${empleado.id}) · ${desde.toISOString()} → ${hasta.toISOString()}${dry ? " · DRY" : ""}`);

  if (dry) {
    const params = new URLSearchParams({
      startDateTime: desde.toISOString(),
      endDateTime: hasta.toISOString(),
      $select: "iCalUId",
      $top: "100",
    });
    let url: string | null = `/users/${encodeURIComponent(empleado.email)}/calendarView?${params}`;
    let total = 0;
    while (url) {
      const res = await graphFetch(url);
      if (!res.ok) throw new Error(`Graph HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { value: unknown[]; "@odata.nextLink"?: string };
      total += body.value.length;
      url = body["@odata.nextLink"] ?? null;
    }
    console.log(`Eventos en Graph: ${total}`);
    return;
  }

  // Por meses: si un tramo falla, lo ya registrado se queda (registrar_reunion es idempotente).
  const totales = { eventos: 0, conExternos: 0, relacionesNuevas: 0 };
  for (let ini = desde.getTime(); ini < hasta.getTime(); ini += 30 * DIA_MS) {
    const fin = new Date(Math.min(ini + 30 * DIA_MS, hasta.getTime()));
    const r = await sincronizarEmpleado(empleado, new Date(ini), fin);
    totales.eventos += r.eventos;
    totales.conExternos += r.conExternos;
    totales.relacionesNuevas += r.relacionesNuevas;
    console.log(`${new Date(ini).toISOString().slice(0, 10)} → ${fin.toISOString().slice(0, 10)}: ${r.eventos} eventos, ${r.conExternos} con externos, ${r.relacionesNuevas} relaciones nuevas`);
  }
  console.log("Total:", totales);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
