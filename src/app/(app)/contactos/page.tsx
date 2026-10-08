import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { btn } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { listEtiquetas, listMisRelaciones } from "@/modules/crm/data";
import { ContactList } from "@/modules/crm/ui/ContactList";

export const metadata = { title: "Mis contactos" };

export default async function ContactosPage() {
  const { db, user } = await getCrm();
  const [relaciones, etiquetas] = await Promise.all([listMisRelaciones(db, user.id), listEtiquetas(db)]);

  return (
    <>
      <PageHeader
        title="Mis contactos"
        subtitle="Personas externas con las que te has reunido o que has añadido."
        actions={
          <Link href="/contactos/nuevo" className={`${btn.primary} hidden lg:inline-flex`}>
            <Icon name="plus" className="h-4 w-4" /> Añadir contacto
          </Link>
        }
      />
      <ContactList relaciones={relaciones} etiquetas={etiquetas} />
    </>
  );
}
