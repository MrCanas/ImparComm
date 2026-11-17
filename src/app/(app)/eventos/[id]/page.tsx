import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { KPICard } from "@/components/ui/KPICard";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { nombresEmpleados } from "@/modules/crm/data";
import { auditoria, emailsDeBaja, getAjustes, getEvento, listarEnvios, listarInvitados, listarPlantillas } from "@/modules/eventos/data";
import { Asistentes } from "@/modules/eventos/ui/Asistentes";
import { fechaHora, fechaLarga } from "@/modules/eventos/ui/comun";
import { EventoForm } from "@/modules/eventos/ui/EventoForm";
import { FormEnvio } from "@/modules/eventos/ui/FormEnvio";
import { Importador } from "@/modules/eventos/ui/Importador";
import { PlantillasLista } from "@/modules/eventos/ui/PlantillasLista";
import { TablaInvitados } from "@/modules/eventos/ui/TablaInvitados";

export const metadata = { title: "Evento" };

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "invitados", label: "Invitados" },
  { key: "plantillas", label: "Plantillas" },
  { key: "envios", label: "Envíos" },
  { key: "asistentes", label: "Asistentes" },
  { key: "ajustes", label: "Datos del evento" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ESTADO_ENVIO: Record<string, { t: string; tono: "gold" | "green" | "muted" | "red" | "navy" }> = {
  borrador: { t: "Borrador", tono: "muted" },
  en_curso: { t: "En curso", tono: "green" },
  pausado: { t: "En pausa", tono: "gold" },
  completado: { t: "Completado", tono: "navy" },
  cancelado: { t: "Cancelado", tono: "red" },
};

export default async function EventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; nuevo?: string }> }) {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const [{ id }, { tab: raw, nuevo }] = await Promise.all([params, searchParams]);
  const evento = await getEvento(db, id);
  if (!evento) notFound();
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "resumen";

  let contenido: React.ReactNode = null;

  if (tab === "resumen") {
    const [invitados, bajas, envios, registro] = await Promise.all([listarInvitados(db, id), emailsDeBaja(db), listarEnvios(db, id), auditoria(db, id, 30)]);
    const n = (f: (i: (typeof invitados)[number]) => boolean) => invitados.filter(f).length;
    const si = invitados.filter((i) => i.respuesta === "si");
    const personas = si.length + si.filter((i) => i.acompanante).length;
    const { count: enviados } = await db
      .from("envio_destinatarios")
      .select("invitado_id", { count: "exact", head: true })
      .in("envio_id", envios.length ? envios.map((e) => e.id) : ["00000000-0000-0000-0000-000000000000"])
      .eq("estado", "enviado");
    const actores = await nombresEmpleados(db, registro.map((r) => r.actor).filter((x): x is string => Boolean(x)));
    contenido = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard title="Invitados" value={invitados.length} subtitle={`${n((i) => bajas.has(i.email))} bajas · ${n((i) => i.rebotado_en !== null)} rebotes · ${n((i) => i.excluido)} excluidos`} />
          <KPICard title="Correos enviados" value={enviados ?? 0} subtitle={`${envios.length} envíos`} />
          <KPICard title="Han visto la invitación" value={n((i) => i.n_visitas > 0)} subtitle="visitaron la página de respuesta" />
          <KPICard title="Asistentes" value={personas} subtitle={`${si.length} confirmados + acompañantes${evento.aforo ? ` · aforo ${evento.aforo}` : ""}`} highlight />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Sí", n((i) => i.respuesta === "si"), "text-emerald-700"],
            ["Quizás", n((i) => i.respuesta === "quizas"), "text-amber-700"],
            ["No", n((i) => i.respuesta === "no"), "text-red-700"],
            ["Sin respuesta", n((i) => !i.respuesta), "text-text-primary"],
          ].map(([t, v, c]) => (
            <div key={t as string} className={`${card} p-3`}>
              <p className="text-xs uppercase tracking-wider text-text-muted">{t}</p>
              <p className={`mt-1 text-2xl font-semibold ${c}`}>{v}</p>
            </div>
          ))}
        </div>
        <div>
          <SectionTitle>Actividad</SectionTitle>
          <ul className={`${card} divide-y divide-subtle/50 text-sm`}>
            {registro.length ? registro.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2 px-3 py-2">
                <span className="text-text-muted">{fechaHora(r.created_at)}</span>
                <span className="font-medium text-text-primary">{r.accion.replace(/_/g, " ")}</span>
                <span className="text-text-muted">{r.actor ? actores.get(r.actor) ?? "" : ""}</span>
                <span className="w-full truncate font-mono text-xs text-text-muted">{JSON.stringify(r.detalle)}</span>
              </li>
            )) : <li className="px-3 py-2 text-text-muted">Sin actividad.</li>}
          </ul>
        </div>
      </div>
    );
  }

  if (tab === "invitados") {
    const [invitados, bajas] = await Promise.all([listarInvitados(db, id), emailsDeBaja(db)]);
    contenido = (
      <div className="space-y-6">
        <Importador eventoId={id} />
        <TablaInvitados eventoId={id} invitados={invitados} bajas={[...bajas].filter((b) => invitados.some((i) => i.email === b))} />
      </div>
    );
  }

  if (tab === "plantillas") {
    contenido = <PlantillasLista eventoId={id} plantillas={await listarPlantillas(db, id)} />;
  }

  if (tab === "envios") {
    const [envios, plantillas, invitados, ajustes] = await Promise.all([listarEnvios(db, id), listarPlantillas(db, id), listarInvitados(db, id), getAjustes(db)]);
    const etiquetas = [...new Set(invitados.flatMap((i) => i.etiquetas))].sort();
    const origenes = [...new Set(invitados.map((i) => i.origen).filter((o): o is string => Boolean(o)))].sort();
    contenido = (
      <div className="space-y-4">
        {envios.length ? (
          <ul className="space-y-2">
            {envios.map((e) => (
              <li key={e.id}>
                <Link href={`/eventos/${id}/envios/${e.id}`} className={`${card} flex flex-wrap items-center gap-2 p-3 hover:border-icam-900/30`}>
                  <Badge tone={ESTADO_ENVIO[e.estado]!.tono}>{ESTADO_ENVIO[e.estado]!.t}</Badge>
                  <span className="font-medium text-text-primary">{e.nombre}</span>
                  <span className="text-sm text-text-muted">{plantillas.find((p) => p.id === e.plantilla_id)?.nombre}</span>
                  <span className="ml-auto text-xs text-text-muted">{fechaHora(e.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-text-muted">Aún no hay envíos.</p>}
        {nuevo ? (
          <>
            <SectionTitle>Nuevo envío</SectionTitle>
            <FormEnvio eventoId={id} plantillas={plantillas} etiquetas={etiquetas} origenes={origenes} delayMinS={ajustes.delay_min_ms / 1000} />
          </>
        ) : (
          <Link href={`/eventos/${id}?tab=envios&nuevo=1`} className={btn.primary}>Nuevo envío</Link>
        )}
      </div>
    );
  }

  if (tab === "asistentes") {
    const invitados = await listarInvitados(db, id);
    const resp = await nombresEmpleados(db, invitados.map((i) => i.responsable_id).filter((x): x is string => Boolean(x)));
    contenido = <Asistentes invitados={invitados} aforo={evento.aforo} nombresResponsables={Object.fromEntries(resp)} />;
  }

  if (tab === "ajustes") {
    contenido = <EventoForm evento={evento} />;
  }

  return (
    <>
      <PageHeader
        title={evento.nombre}
        subtitle={`${fechaLarga(evento.inicio)}${evento.lugar ? ` · ${evento.lugar}` : ""}`}
        actions={<Link href="/eventos" className={btn.secondary}>Todos los eventos</Link>}
      />
      <nav className="-mx-3 mb-4 flex gap-2 overflow-x-auto no-scrollbar px-3 pb-1 sm:mx-0 sm:px-0" aria-label="Secciones">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/eventos/${id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition ${
              tab === t.key ? "bg-icam-900 text-white" : "border border-subtle bg-card text-text-body hover:bg-page"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {contenido}
    </>
  );
}
