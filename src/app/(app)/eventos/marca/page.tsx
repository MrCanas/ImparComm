import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { btn } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { entornoPermiteReal } from "@/lib/eventos/guardas";
import { getAjustes } from "@/modules/eventos/data";
import { MarcaAjustes } from "@/modules/eventos/ui/MarcaAjustes";

export const metadata = { title: "Marca y modo de envío" };

export default async function MarcaPage() {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const ajustes = await getAjustes(db);
  return (
    <>
      <PageHeader
        title="Marca y modo de envío"
        subtitle="Tamaños y colores de todas las plantillas de bloques. Títulos en Baskerville (mayúsculas), cuerpo en Lato."
        actions={<Link href="/eventos" className={btn.secondary}>Volver a eventos</Link>}
      />
      <MarcaAjustes marca={ajustes.marca} modoPrueba={ajustes.modo_prueba} entornoReal={entornoPermiteReal()} />
    </>
  );
}
