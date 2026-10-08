import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { listEtiquetas } from "@/modules/crm/data";
import { NuevoHitoForm } from "@/modules/crm/ui/HitoUI";

export const metadata = { title: "Abrir hito" };

export default async function NuevoHitoPage() {
  const { db } = await getCrm();
  const etiquetas = await listEtiquetas(db);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Abrir hito"
        subtitle="Las etiquetas de filtro deciden qué contactos aparecen como candidatos para cada empleado."
      />
      <NuevoHitoForm etiquetas={etiquetas} />
    </div>
  );
}
