import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { btn } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { getEvento, getPlantilla, listarInvitados, versionesPlantilla } from "@/modules/eventos/data";
import { EditorPlantilla } from "@/modules/eventos/ui/EditorPlantilla";

export const metadata = { title: "Plantilla" };

export default async function PlantillaPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const { id, pid } = await params;
  const [evento, plantilla] = await Promise.all([getEvento(db, id), getPlantilla(db, pid)]);
  if (!evento || !plantilla || plantilla.evento_id !== id) notFound();
  const [invitados, versiones] = await Promise.all([listarInvitados(db, id), versionesPlantilla(db, pid)]);
  return (
    <>
      <PageHeader
        title={plantilla.nombre}
        subtitle={evento.nombre}
        actions={<Link href={`/eventos/${id}?tab=plantillas`} className={btn.secondary}>Volver</Link>}
      />
      <EditorPlantilla
        eventoId={id}
        plantilla={plantilla}
        invitados={invitados.slice(0, 300).map((i) => ({ id: i.id, email: i.email, nombre: i.nombre }))}
        versiones={versiones.map((v) => ({ version: v.version, created_at: v.created_at }))}
      />
    </>
  );
}
