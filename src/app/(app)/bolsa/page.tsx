import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { hoyMadrid } from "@/lib/format";
import { getStatsBolsa } from "@/modules/crm/data";
import { BolsaComun, type BolsaItem } from "@/modules/crm/ui/BolsaUI";

export const metadata = { title: "Bolsa común" };

export default async function BolsaPage() {
  const { db, user } = await getCrm();
  if (!user.canSeeBolsa) notFound();

  const [{ data, error }, stats] = await Promise.all([db.rpc("bolsa_comun"), getStatsBolsa(db)]);
  if (error) throw new Error(`bolsa_comun: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Bolsa común"
        subtitle="Contactos de empleados que ya no están en Impar. Rescátalos antes de que se enfríen: al adoptarlos pasan a tu bandeja como nuevos."
      />
      <BolsaComun items={(data ?? []) as BolsaItem[]} stats={stats} hoy={hoyMadrid()} />
    </>
  );
}
