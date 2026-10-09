import { PageHeader } from "@/components/ui/PageHeader";
import { haceDias } from "@/lib/format";
import { getCrm } from "@/lib/db/server";
import { eventosGrandes, getPuntos, listEtiquetas, listMisRelaciones } from "@/modules/crm/data";
import { RitualDeck } from "@/modules/crm/ui/RitualDeck";

export const metadata = { title: "Ritual" };

type Periodo = "semana" | "mes" | "todo";

export default async function RitualPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: raw } = await searchParams;
  const periodo: Periodo = raw === "mes" || raw === "todo" ? raw : "semana";

  const { db, user } = await getCrm();
  const [relaciones, etiquetas, puntos] = await Promise.all([
    listMisRelaciones(db, user.id),
    listEtiquetas(db),
    getPuntos(db, user.id),
  ]);

  const dias = periodo === "semana" ? 7 : periodo === "mes" ? 31 : null;
  const desde = haceDias(dias);
  const nuevas = relaciones.filter((r) => r.estado === "nueva");
  const cola = nuevas
    .filter((r) => new Date(r.ultima_reunion ?? r.created_at).getTime() >= desde)
    .sort((a, b) => (b.ultima_reunion ?? b.created_at).localeCompare(a.ultima_reunion ?? a.created_at));

  const eventos = await eventosGrandes(db, cola);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Ritual"
        subtitle="Desliza a la derecha para clasificar con etiquetas y a la izquierda para archivar."
      />
      <RitualDeck
        key={periodo}
        cola={cola}
        eventos={eventos}
        etiquetas={etiquetas}
        periodo={periodo}
        totalPendientes={nuevas.length}
        puntosIniciales={puntos.total}
        porBono={puntos.porBono}
      />
    </div>
  );
}
