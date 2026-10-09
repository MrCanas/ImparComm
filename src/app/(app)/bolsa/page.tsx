import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { BolsaList, type BolsaItem } from "@/modules/crm/ui/AdminUI";

export const metadata = { title: "Bolsa común" };

export default async function BolsaPage() {
  const { db, user } = await getCrm();
  if (!user.canSeeBolsa) notFound();

  const { data, error } = await db.rpc("bolsa_comun");
  if (error) throw new Error(`bolsa_comun: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Bolsa común"
        subtitle="Contactos de empleados que ya no están en Impar. Al adoptarlos pasan a tu bandeja como nuevos."
      />
      <BolsaList items={(data ?? []) as BolsaItem[]} />
    </>
  );
}
