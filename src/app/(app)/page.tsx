import Link from "next/link";

import { AvatarStack } from "@/components/fx/AvatarStack";
import { ProgressBar, ProgressRing } from "@/components/fx/Progress";
import { Reveal } from "@/components/fx/Reveal";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { KPICard } from "@/components/ui/KPICard";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { diasDesde, fmtFecha, hoyMadrid } from "@/lib/format";
import { desdeDias, getHitosResumen, getMiPosicion, getPuntos, getStatsEmpleado, listHitos, listMisRelaciones } from "@/modules/crm/data";
import { logrosDe, rachaDe, xpDe } from "@/modules/crm/gamificacion";
import { TarjetaJuego } from "@/modules/crm/ui/Juego";

export default async function InicioPage() {
  const { db, user } = await getCrm();
  const [relaciones, puntos, hitos, stats, posicion, resumen] = await Promise.all([
    listMisRelaciones(db, user.id),
    getPuntos(db, user.id),
    listHitos(db),
    getStatsEmpleado(db, desdeDias(7)),
    getMiPosicion(db, desdeDias(7)),
    getHitosResumen(db),
  ]);

  const hoy = hoyMadrid();
  const racha = rachaDe(stats.dias_activos.map((d) => d.dia), hoy);
  const logros = logrosDe(stats.totales, racha.mejor);
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
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Hola, {nombre} 👋</h1>
        <p className="text-sm text-text-muted">Que ningún contacto quede olvidado. Cada contacto suma XP.</p>
      </div>

      <TarjetaJuego
        xp={xpDe(stats.totales)}
        racha={racha.actual}
        mejorRacha={racha.mejor}
        posicion={posicion.posicion}
        totalEquipo={posicion.total}
        logros={logros}
      />

      {pendientes.length > 0 ? (
        <Link
          href="/ritual"
          className="fx-lift flex items-center gap-4 rounded-lg border-2 border-icam-gold bg-card p-4 shadow-sm sm:p-5"
        >
          <span className="flex h-12 w-12 shrink-0 animate-pulse-gold items-center justify-center rounded-full bg-icam-gold text-white [animation-iteration-count:infinite]">
            <Icon name="cards" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text-primary">
              Tienes {pendientes.length} contacto{pendientes.length === 1 ? "" : "s"} nuevo
              {pendientes.length === 1 ? "" : "s"}
            </span>
            <span className="block text-sm text-text-muted">
              Unos {minutos} minuto{minutos === 1 ? "" : "s"} de ritual · hasta +{pendientes.length} ⭐
            </span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-icam-gold" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard title="Contactos" value={activas.length} subtitle={`${relaciones.length - activas.length} archivados`} />
        <KPICard title="Por clasificar" value={pendientes.length} subtitle="en la bandeja" highlight={pendientes.length > 0} />
        <KPICard title="Recordatorios" value={vencidas.length} subtitle="vencidos" />
        <KPICard
          title="Puntos"
          value={puntos.total}
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
                {hitosGenerales.map((h, i) => {
                  const r = resumen.get(h.id) ?? { total: 0, contactados: 0, nombres: [] };
                  const pct = r.total ? r.contactados / r.total : 0;
                  return (
                    <Reveal as="li" key={h.id} index={i}>
                      <Link href={`/hitos/${h.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-page">
                        <ProgressRing value={pct} size={36} stroke={4} color={pct === 1 ? "#3E9A55" : "#B89660"} label={`${r.contactados} de ${r.total}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-text-primary">{h.nombre}</span>
                          <span className="block text-xs text-text-muted">{r.total ? `${r.contactados}/${r.total} contactados` : "Sin invitados"}</span>
                        </span>
                        <AvatarStack nombres={r.nombres} total={r.total} max={3} />
                      </Link>
                    </Reveal>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={`${card} p-4`}>
            <SectionTitle>Bonos</SectionTitle>
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">🎁</span>
              <ProgressBar value={puntos.haciaSiguiente / puntos.porBono} className="h-3 flex-1" label="Progreso hacia el próximo bono" />
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
