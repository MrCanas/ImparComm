import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { btn } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { entornoPermiteReal } from "@/lib/eventos/guardas";
import { destinatariosEnvio, enviadosHoy, getAjustes, getEnvio, getEvento, listarInvitados, listarPlantillas } from "@/modules/eventos/data";
import { Consola } from "@/modules/eventos/ui/Consola";
import { FormEnvio } from "@/modules/eventos/ui/FormEnvio";

export const metadata = { title: "Envío" };

export default async function EnvioPage({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const { id, eid } = await params;
  const [evento, envio] = await Promise.all([getEvento(db, id), getEnvio(db, eid)]);
  if (!evento || !envio || envio.evento_id !== id) notFound();
  const [destinatarios, ajustes, hoy, plantillas, invitados] = await Promise.all([
    destinatariosEnvio(db, eid),
    getAjustes(db),
    enviadosHoy(db),
    listarPlantillas(db, id),
    listarInvitados(db, id),
  ]);
  const conteo: Record<string, number> = {};
  for (const d of destinatarios) conteo[d.estado] = (conteo[d.estado] ?? 0) + 1;
  const editable = envio.estado === "borrador" || envio.estado === "pausado";
  const plantilla = plantillas.find((p) => p.id === envio.plantilla_id);

  return (
    <>
      <PageHeader
        title={envio.nombre}
        subtitle={`${evento.nombre} · plantilla «${plantilla?.nombre ?? "?"}» (v${plantilla?.version ?? "?"}) · un correo cada ${envio.delay_ms / 1000} s`}
        actions={<Link href={`/eventos/${id}?tab=envios`} className={btn.secondary}>Volver</Link>}
      />
      <Consola
        envio={envio}
        conteo={conteo}
        destinatarios={destinatarios}
        modoPrueba={ajustes.modo_prueba || !entornoPermiteReal()}
        enviadosHoy={hoy}
        topeDiario={ajustes.tope_diario}
      />
      {editable ? (
        <div className="mt-6">
          <SectionTitle>{envio.estado === "pausado" ? "Editar mientras está en pausa (se aplica al reanudar)" : "Editar antes de iniciar"}</SectionTitle>
          <FormEnvio
            eventoId={id}
            envio={envio}
            plantillas={plantillas}
            etiquetas={[...new Set(invitados.flatMap((i) => i.etiquetas))].sort()}
            origenes={[...new Set(invitados.map((i) => i.origen).filter((o): o is string => Boolean(o)))].sort()}
            delayMinS={ajustes.delay_min_ms / 1000}
          />
        </div>
      ) : null}
    </>
  );
}
