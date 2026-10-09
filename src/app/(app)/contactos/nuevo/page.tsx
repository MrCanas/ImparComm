import { PageHeader } from "@/components/ui/PageHeader";
import { AltaContactoForm } from "@/modules/crm/ui/AltaContactoForm";

export const metadata = { title: "Añadir contacto" };

export default function NuevoContactoPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Añadir contacto"
        subtitle="Para comidas o encuentros fuera del calendario. Si la persona ya existe (mismo email), se enlaza contigo."
      />
      <AltaContactoForm />
    </div>
  );
}
