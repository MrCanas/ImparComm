import { NextRequest, NextResponse } from "next/server";

import { esCronAutorizado } from "@/lib/cron";
import { empleadosActivos } from "@/lib/db/service";
import { flags } from "@/lib/flags";
import { renovarSuscripciones, sincronizarTodos } from "@/lib/graph/calendario";
import { completarFirmas } from "@/lib/graph/firmas";

export const maxDuration = 300;

/**
 * Repaso nocturno: renueva las suscripciones de Graph (caducan a los 7 días),
 * sincroniza los calendarios y, si está activo, completa cargo y teléfono
 * desde las firmas.
 */
export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!flags.calendario) return NextResponse.json({ omitido: "CALENDARIO_ENABLED no está activo" });

  const suscripciones = await renovarSuscripciones();
  const calendario = await sincronizarTodos();

  let firmas: unknown = "FIRMAS_ENABLED no está activo";
  if (flags.firmas) {
    const resultados = [];
    for (const e of await empleadosActivos()) {
      try {
        resultados.push({ empleado: e.email, ...(await completarFirmas(e)) });
      } catch (err) {
        resultados.push({ empleado: e.email, error: err instanceof Error ? err.message : String(err) });
      }
    }
    firmas = resultados;
  }

  return NextResponse.json({ suscripciones, calendario, firmas });
}
