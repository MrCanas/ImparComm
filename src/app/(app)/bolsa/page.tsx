import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { hoyMadrid } from "@/lib/format";
import { getStatsBolsa, listBolsa } from "@/modules/crm/data";
import { BolsaComun } from "@/modules/crm/ui/BolsaUI";

export const metadata = { title: "Bolsa común" };

export default async function BolsaPage() {
  const { db, user } = await getCrm();
  if (!user.canSeeBolsa) notFound();

  const [items, stats] = await Promise.all([listBolsa(db), getStatsBolsa(db)]);

  return (
    <>
      <PageHeader
        title="Bolsa común"
        subtitle="Contactos de empleados que ya no están en Impar. Rescátalos antes de que se enfríen: al adoptarlos pasan a tu bandeja como nuevos."
      />
      <BolsaComun items={items} stats={stats} hoy={hoyMadrid()} />
    </>
  );
}
