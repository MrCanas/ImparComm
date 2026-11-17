import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { entornoPermiteReal } from "@/lib/eventos/guardas";
import { getAjustes, listarEventos } from "@/modules/eventos/data";
import { fechaLarga } from "@/modules/eventos/ui/comun";
import { EventoForm } from "@/modules/eventos/ui/EventoForm";

export const metadata = { title: "Eventos" };

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const [eventos, ajustes, { nuevo }] = await Promise.all([listarEventos(db), getAjustes(db), searchParams]);
  const prueba = ajustes.modo_prueba || !entornoPermiteReal();

  return (
    <>
      <PageHeader
        title="Eventos"
        subtitle="Invitaciones con respuesta, envíos controlados y lista de asistentes."
        actions={
          <>
            <Link href="/eventos/marca" className={btn.secondary}>Marca y modo de envío</Link>
            <Link href="/eventos?nuevo=1" className={btn.primary}>Nuevo evento</Link>
          </>
        }
      />
      <div className={`mb-4 rounded-md px-4 py-3 text-sm ${prueba ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
        {prueba ? (
          <>
            <strong>Modo prueba activo.</strong> Solo se pueden enviar correos a direcciones @yopmail.com.
          </>
        ) : (
          <>
            <strong>Envío real activado.</strong> Los envíos llegan a los invitados reales.
          </>
        )}
      </div>

      {nuevo ? (
        <div className="mb-6">
          <EventoForm />
        </div>
      ) : null}

      {eventos.length === 0 && !nuevo ? (
        <EmptyState title="Aún no hay eventos" action={<Link href="/eventos?nuevo=1" className={btn.primary}>Crear el primero</Link>}>
          Crea el evento, importa la lista de invitados, diseña las plantillas y lanza los envíos a mano.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {eventos.map((e) => (
            <li key={e.id}>
              <Link href={`/eventos/${e.id}`} className={`${card} block p-4 transition hover:border-icam-900/30`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-text-primary">{e.nombre}</p>
                  <Badge tone={e.estado === "activo" ? "green" : e.estado === "cerrado" ? "muted" : "gold"}>
                    {e.estado === "activo" ? "Activo" : e.estado === "cerrado" ? "Cerrado" : "Borrador"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-text-muted">{fechaLarga(e.inicio)}</p>
                {e.lugar ? <p className="text-sm text-text-muted">{e.lugar}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
