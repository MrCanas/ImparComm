import { crmService } from "@/lib/db/service";
import { enlacesInvitado } from "@/lib/eventos/enlaces";
import { generarIcs } from "@/lib/eventos/ics";
import { buscarPorToken } from "@/lib/eventos/publico";

/** Descarga del .ics individual (METHOD:PUBLISH: se añade sin pedir respuesta). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await buscarPorToken(token);
  if (!datos) return new Response("No encontrado", { status: 404 });
  const { invitado, evento } = datos;
  const remitente = evento.remitente || process.env.EMAIL_FROM?.trim() || "noreply@imparcapital.com";
  const ics = generarIcs({
    metodo: "PUBLISH",
    uidEvento: evento.ics_uid,
    invitadoId: invitado.id,
    secuencia: evento.ics_sequence,
    inicio: new Date(evento.inicio),
    fin: new Date(evento.fin),
    resumen: evento.nombre,
    lugar: [evento.lugar, evento.direccion].filter(Boolean).join(", ") || null,
    url: enlacesInvitado(invitado.id).respuesta,
    organizador: { email: remitente, nombre: evento.remitente_nombre },
  });
  await crmService().from("evento_invitados").update({ ics_descargado_en: new Date().toISOString() }).eq("id", invitado.id);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evento.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
