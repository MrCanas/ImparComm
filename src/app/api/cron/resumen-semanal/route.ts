import { NextRequest, NextResponse } from "next/server";

import { esCronAutorizado } from "@/lib/cron";
import { enviarResumenes } from "@/lib/email/resumen";
import { flags } from "@/lib/flags";
import { esMomentoDelResumen } from "@/lib/integraciones/logica";

export const maxDuration = 300;

/**
 * Email semanal. Vercel lo lanza los viernes a las 7:00 y a las 8:00 UTC; solo
 * actúa la ejecución que cae a las 9:00 en Madrid (cambia con el horario de
 * verano). `?forzar=1` salta la comprobación de hora (pruebas manuales).
 */
export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!flags.resumenSemanal) return NextResponse.json({ omitido: "RESUMEN_SEMANAL_ENABLED no está activo" });

  const forzar = request.nextUrl.searchParams.get("forzar") === "1";
  if (!forzar && !esMomentoDelResumen(new Date())) {
    return NextResponse.json({ omitido: "No son las 9:00 del viernes en Madrid" });
  }
  return NextResponse.json(await enviarResumenes());
}
