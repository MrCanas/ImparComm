import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { hoyMadrid } from "@/lib/format";
import { desdeDias, getMiPosicion, getStatsEmpleado, getStatsEquipo } from "@/modules/crm/data";
import { objetivosDe, rachaDe } from "@/modules/crm/gamificacion";
import { RANGOS_ANALITICAS as RANGOS } from "@/modules/crm/types";
import { Analiticas } from "@/modules/crm/ui/AnaliticasUI";

export const metadata = { title: "Analíticas" };

export default async function AnaliticasPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; vista?: string }>;
}) {
  const sp = await searchParams;
  const rango = (RANGOS as readonly number[]).includes(Number(sp.rango)) ? Number(sp.rango) : 30;
  const { db, user } = await getCrm();
  const vista = user.isAdmin && sp.vista === "equipo" ? "equipo" : "yo";
  const desde = desdeDias(rango);

  const [stats, posicion, equipo] = await Promise.all([
    getStatsEmpleado(db, desde),
    getMiPosicion(db, desdeDias(7)),
    vista === "equipo" ? getStatsEquipo(db, desde) : Promise.resolve(null),
  ]);
  const hoy = hoyMadrid();
  const racha = rachaDe(stats.dias_activos.map((d) => d.dia), hoy);

  return (
    <>
      <PageHeader title="Analíticas" subtitle={vista === "equipo" ? "Actividad del equipo" : "Tu actividad, racha y objetivos"} />
      <Analiticas
        rango={rango}
        vista={vista}
        esAdmin={user.isAdmin}
        stats={stats}
        equipo={equipo}
        hoy={hoy}
        userId={user.id}
        resumen={{
          racha: racha.actual,
          mejorRacha: racha.mejor,
          posicion: posicion.posicion,
          totalEquipo: posicion.total,
          objetivos: objetivosDe(stats.totales, racha.mejor),
        }}
      />
    </>
  );
}
