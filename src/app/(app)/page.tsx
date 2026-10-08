import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { KPICard } from "@/components/ui/KPICard";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { diasDesde, fmtFecha, hoyMadrid } from "@/lib/format";
import { getPuntos, listHitos, listMisRelaciones } from "@/modules/crm/data";

export default async function InicioPage() {
  const { db, user } = await getCrm();
  const [relaciones, puntos, hitos] = await Promise.all([
    listMisRelaciones(db, user.id),
    getPuntos(db, user.id),
    listHitos(db),
  ]);

  const hoy = hoyMadrid();
  const pendientes = relaciones.filter((r) => r.estado === "nueva");
  const activas = relaciones.filter((r) => r.estado !== "archivada");
  const vencidas = relaciones
    .filter((r) => r.estado === "clasificada" && r.proximo_recordatorio && r.proximo_recordatorio <= hoy)
    .sort((a, b) => a.proximo_recordatorio!.localeCompare(b.proximo_recordatorio!));
  const hitosGenerales = hitos.filter((h) => h.ambito === "general").slice(0, 4);
  const nombre = user.name.split(" ")[0];
  const minutos = Math.max(1, Math.round(pendientes.length / 4));

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Hola, {nombre}</h1>
        <p className="text-sm text-text-muted">Que ningún contacto quede olvidado.</p>
      </div>

      {pendientes.length > 0 ? (
        <Link
          href="/ritual"
          className="flex items-center gap-4 rounded-lg bg-icam-900 p-4 text-white shadow-sm transition hover:bg-icam-800 sm:p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-icam-gold">
            <Icon name="cards" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              Tienes {pendientes.length} contacto{pendientes.length === 1 ? "" : "s"} nuevo
              {pendientes.length === 1 ? "" : "s"}
            </span>
            <span className="block text-sm text-white/70">Unos {minutos} minuto{minutos === 1 ? "" : "s"} de ritual</span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-white/70" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard title="Contactos" value={String(activas.length)} subtitle={`${relaciones.length - activas.length} archivados`} />
        <KPICard title="Por clasificar" value={String(pendientes.length)} subtitle="en la bandeja" highlight={pendientes.length > 0} />
        <KPICard title="Recordatorios" value={String(vencidas.length)} subtitle="vencidos" />
        <KPICard
          title="Puntos"
          value={String(puntos.total)}
          subtitle={`${puntos.haciaSiguiente}/${puntos.porBono} para el próximo bono`}
          highlight
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle>Recordatorios vencidos</SectionTitle>
          {vencidas.length === 0 ? (
            <EmptyState title="Todo al día">
              Aquí aparecerán las personas con las que hace tiempo que no te reúnes según el plazo de sus etiquetas.
            </EmptyState>
          ) : (
            <ul className={`${card} divide-y divide-subtle/60`}>
              {vencidas.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/contactos/${r.persona.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-page"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text-primary">{r.persona.nombre}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {r.persona.empresa?.nombre ?? "Sin empresa"} · última reunión {fmtFecha(r.ultima_reunion ?? r.created_at)}
                      </span>
                    </span>
                    <Badge tone="red">hace {diasDesde(r.proximo_recordatorio!)} d</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-5">
          <div>
            <SectionTitle aside={<Link href="/hitos" className="text-xs font-medium text-icam-900 hover:underline">Ver todos</Link>}>
              Hitos generales
            </SectionTitle>
            {hitosGenerales.length === 0 ? (
              <EmptyState title="Sin hitos abiertos" action={<Link href="/hitos/nuevo" className={btn.secondary}>Abrir hito</Link>} />
            ) : (
              <ul className={`${card} divide-y divide-subtle/60`}>
                {hitosGenerales.map((h) => (
                  <li key={h.id}>
                    <Link href={`/hitos/${h.id}`} className="flex min-h-12 items-center justify-between gap-2 px-4 py-3 hover:bg-page">
                      <span className="truncate font-medium text-text-primary">{h.nombre}</span>
                      <span className="shrink-0 text-xs text-text-muted">{fmtFecha(h.fecha)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${card} p-4`}>
            <SectionTitle>Bonos</SectionTitle>
            <div className="h-2 overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-icam-gold transition-all"
                style={{ width: `${(puntos.haciaSiguiente / puntos.porBono) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {puntos.porBono - puntos.haciaSiguiente} puntos para un bono de {puntos.importeBono} € · {puntos.bonos.length} conseguido
              {puntos.bonos.length === 1 ? "" : "s"}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
