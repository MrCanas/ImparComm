import Link from "next/link";

import { AvatarStack } from "@/components/fx/AvatarStack";
import { ProgressRing } from "@/components/fx/Progress";
import { Reveal } from "@/components/fx/Reveal";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { btn, card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { fmtFecha } from "@/lib/format";
import { getHitosResumen, listEtiquetas, listHitos, nombresEmpleados } from "@/modules/crm/data";
import type { Hito } from "@/modules/crm/types";

export const metadata = { title: "Hitos" };

export default async function HitosPage() {
  const { db, user } = await getCrm();
  const [hitos, etiquetas, resumen] = await Promise.all([listHitos(db), listEtiquetas(db), getHitosResumen(db)]);
  const nombres = await nombresEmpleados(db, hitos.map((h) => h.abierto_por));
  const etiquetaNombre = new Map(etiquetas.map((e) => [e.id, e.nombre]));

  const generales = hitos.filter((h) => h.ambito === "general");
  const personales = hitos.filter((h) => h.ambito === "personal" && h.abierto_por === user.id);

  function lista(items: Hito[], vacio: string) {
    if (items.length === 0) return <EmptyState title={vacio} />;
    return (
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((h, i) => {
          const r = resumen.get(h.id) ?? { total: 0, contactados: 0, nombres: [] };
          const pct = r.total ? r.contactados / r.total : 0;
          return (
            <Reveal as="li" key={h.id} index={i}>
              <Link href={`/hitos/${h.id}`} className={`${card} fx-lift group flex h-full gap-3 p-4 hover:border-icam-900`}>
                <ProgressRing value={pct} size={56} stroke={6} color={pct === 1 ? "#3E9A55" : "#B89660"} label={`${r.contactados} de ${r.total} contactados`}>
                  <span className="text-xs font-bold text-text-primary">{r.total ? `${Math.round(pct * 100)}%` : "—"}</span>
                </ProgressRing>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-text-primary">{h.nombre}</span>
                    <span className="shrink-0 text-xs text-text-muted">{fmtFecha(h.fecha)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {h.tipo ?? "Sin tipo"} · abierto por {h.abierto_por === user.id ? "ti" : (nombres.get(h.abierto_por) ?? "—")}
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    {r.total > 0 ? (
                      <>
                        <AvatarStack nombres={r.nombres} total={r.total} max={5} />
                        <span className="text-xs text-text-muted">
                          <span className="font-semibold text-text-primary">{r.contactados}</span>/{r.total} contactados
                        </span>
                      </>
                    ) : (
                      <span className="text-xs italic text-text-muted">Sin invitados aún · ¡sé el primero!</span>
                    )}
                  </span>
                  {h.etiquetas_filtro.length > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-1">
                      {h.etiquetas_filtro.map((id) => (
                        <Badge key={id} tone="navy">{etiquetaNombre.get(id) ?? "—"}</Badge>
                      ))}
                    </span>
                  ) : null}
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="Hitos"
        subtitle="Momentos de Impar a los que invitar a tus contactos: levantamientos, eventos, comercializaciones…"
        actions={
          <Link href="/hitos/nuevo" className={btn.primary}>
            <Icon name="plus" className="h-4 w-4" /> Abrir hito
          </Link>
        }
      />
      <div className="space-y-6">
        <section>
          <SectionTitle>Generales · los ve todo el equipo</SectionTitle>
          {lista(generales, "No hay hitos generales")}
        </section>
        <section>
          <SectionTitle>Personales · solo tú</SectionTitle>
          {lista(personales, "No tienes hitos personales")}
        </section>
      </div>
    </>
  );
}
