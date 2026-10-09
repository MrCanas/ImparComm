import Link from "next/link";
import { notFound } from "next/navigation";

import { Reveal } from "@/components/fx/Reveal";
import { Badge, ESTADO_RELACION } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/PageHeader";
import { card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { fmtFecha, fmtFechaCorta } from "@/lib/format";
import {
  getMiRelacion,
  listEtiquetas,
  listEventosDePersona,
  listHitosDePersona,
  listReunionesDePersona,
} from "@/modules/crm/data";
import { Avatar } from "@/modules/crm/ui/ContactList";
import { ContactoAcciones, EditarPersona, NotasEditor, TagsEditor } from "@/modules/crm/ui/ContactoDetalle";

export default async function ContactoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await getCrm();
  const relacion = await getMiRelacion(db, user.id, id);
  if (!relacion) notFound();

  const [etiquetas, hitos, reuniones, eventos] = await Promise.all([
    listEtiquetas(db),
    listHitosDePersona(db, id),
    listReunionesDePersona(db, id),
    listEventosDePersona(db, id),
  ]);
  const p = relacion.persona;
  const estado = ESTADO_RELACION[relacion.estado];

  return (
    <div className="space-y-4">
      <Link href="/contactos" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-icam-900 lg:min-h-0">
        <Icon name="chevronLeft" className="h-4 w-4" /> Mis contactos
      </Link>

      <section className={`${card} p-4 sm:p-6`}>
        <div className="flex items-start gap-4">
          <Avatar nombre={p.nombre} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">{p.nombre}</h1>
              <Badge tone={estado.tone}>{estado.label}</Badge>
              {p.zoho_id ? <Badge tone="green">En Zoho</Badge> : null}
            </div>
            <p className="text-sm text-text-muted">
              {[p.cargo, p.empresa?.nombre].filter(Boolean).join(" · ") || "Sin cargo ni empresa"}
            </p>
          </div>
          <EditarPersona persona={p} />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {p.email ? (
            <a href={`mailto:${p.email}`} className="flex min-h-11 items-center gap-2 rounded-md border border-subtle px-3 text-sm hover:bg-page">
              <Icon name="mail" className="h-4 w-4 text-text-muted" />
              <span className="truncate">{p.email}</span>
            </a>
          ) : null}
          {p.telefono ? (
            <a href={`tel:${p.telefono}`} className="flex min-h-11 items-center gap-2 rounded-md border border-subtle px-3 text-sm hover:bg-page">
              <Icon name="phone" className="h-4 w-4 text-text-muted" />
              {p.telefono}
            </a>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-text-muted">Última reunión</dt>
            <dd className="font-medium">{fmtFecha(relacion.ultima_reunion)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Próximo recordatorio</dt>
            <dd className="font-medium">{fmtFecha(relacion.proximo_recordatorio)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Origen</dt>
            <dd className="font-medium capitalize">{relacion.origen === "bolsa" ? "Bolsa común" : relacion.origen}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Desde</dt>
            <dd className="font-medium">{fmtFecha(relacion.created_at)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <section className={`${card} p-4`}>
            <SectionTitle>Etiquetas</SectionTitle>
            <TagsEditor personaId={p.id} relacionId={relacion.id} estado={relacion.estado} actuales={p.etiquetas} todas={etiquetas} />
            <p className="mt-2 text-xs text-text-muted">
              Las generales las ve todo el equipo; las personales (borde discontinuo) solo tú.
            </p>
          </section>

          <section className={`${card} p-4`}>
            <SectionTitle>Mis notas</SectionTitle>
            <NotasEditor relacionId={relacion.id} personaId={p.id} inicial={relacion.notas ?? ""} />
          </section>
        </div>

        <div className="space-y-4">
          <section className={`${card} p-4`}>
            <SectionTitle>Hitos</SectionTitle>
            {hitos.length === 0 ? (
              <p className="text-sm text-text-muted">No está en ningún hito.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {hitos.map((h, i) => {
                  const hecho = h.estado === "contactado";
                  return (
                    <Reveal as="li" key={h.hito.id} index={i}>
                      <Link
                        href={`/hitos/${h.hito.id}`}
                        className={`fx-lift flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                          hecho ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-icam-gold/40 bg-icam-gold/10 text-[#7d6235]"
                        }`}
                        title={hecho ? `Contactado ${fmtFecha(h.fecha_contacto)}` : "Pendiente de contactar"}
                      >
                        <span aria-hidden="true">{hecho ? "🏅" : "⏳"}</span>
                        <span className="max-w-[12rem] truncate">{h.hito.nombre}</span>
                      </Link>
                    </Reveal>
                  );
                })}
              </ul>
            )}
            {eventos.length > 0 ? (
              <ol className="mt-4 space-y-0 border-l-2 border-subtle pl-4">
                {eventos.slice(0, 8).map((e, i) => (
                  <Reveal as="li" key={e.id} index={i} className="relative pb-3 last:pb-0">
                    <span
                      className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-4 ring-card ${
                        e.accion === "contactar" ? "bg-emerald-500" : e.accion === "incluir" ? "bg-icam-gold" : "bg-subtle"
                      }`}
                      aria-hidden="true"
                    />
                    <p className="text-sm text-text-body">
                      {{ incluir: "Invitado a", contactar: "Contactado en", volver_pte: "Vuelve a pendiente en", quitar: "Quitado de" }[e.accion]}{" "}
                      <span className="font-medium">{e.hito.nombre}</span>
                      {e.canal ? <span className="text-text-muted"> · {e.canal}</span> : null}
                    </p>
                    <p className="text-xs text-text-muted">{fmtFechaCorta(e.created_at)}</p>
                  </Reveal>
                ))}
              </ol>
            ) : null}
          </section>

          <section className={`${card} p-4`}>
            <SectionTitle>Reuniones</SectionTitle>
            {reuniones.length === 0 ? (
              <p className="text-sm text-text-muted">Sin reuniones registradas. Aparecerán al conectar el calendario.</p>
            ) : (
              <ul className="space-y-2">
                {reuniones.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-sm">
                    <Icon name="calendar" className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    <span>
                      <span className="block font-medium">{r.asunto ?? "(sin asunto)"}</span>
                      <span className="text-xs text-text-muted">{fmtFecha(r.fecha)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ContactoAcciones relacionId={relacion.id} estado={relacion.estado} tieneEtiquetas={p.etiquetas.length > 0} />
        </div>
      </div>
    </div>
  );
}
