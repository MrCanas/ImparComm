import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { getCrm } from "@/lib/db/server";
import { fmtFecha } from "@/lib/format";
import { getHito, listEtiquetas, listHitoPersonas, listMisRelaciones, nombresEmpleados } from "@/modules/crm/data";
import { HitoDetalle } from "@/modules/crm/ui/HitoUI";

export default async function HitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await getCrm();
  const hito = await getHito(db, id);
  if (!hito) notFound();

  const [miembros, relaciones, etiquetas] = await Promise.all([
    listHitoPersonas(db, id),
    listMisRelaciones(db, user.id),
    listEtiquetas(db),
  ]);
  const nombres = await nombresEmpleados(db, [
    hito.abierto_por,
    ...miembros.map((m) => m.contactado_por ?? ""),
  ]);

  // Candidatos: mis contactos clasificados con alguna etiqueta del filtro (o todos si no hay filtro).
  const enHito = new Set(miembros.map((m) => m.persona_id));
  const filtro = new Set(hito.etiquetas_filtro);
  const candidatos = relaciones
    .filter((r) => r.estado === "clasificada" && !enHito.has(r.persona.id))
    .filter((r) => filtro.size === 0 || r.persona.etiquetas.some((e) => filtro.has(e.id)))
    .map((r) => r.persona);

  const etiquetaNombre = new Map(etiquetas.map((e) => [e.id, e.nombre]));
  const puedeGestionar = hito.abierto_por === user.id || user.isAdmin;

  return (
    <div className="space-y-4">
      <Link href="/hitos" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-icam-900 lg:min-h-0">
        <Icon name="chevronLeft" className="h-4 w-4" /> Hitos
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">{hito.nombre}</h1>
          <Badge tone={hito.ambito === "general" ? "navy" : "outline"}>{hito.ambito === "general" ? "General" : "Personal"}</Badge>
        </div>
        <p className="mt-0.5 text-sm text-text-muted">
          {[hito.tipo, fmtFecha(hito.fecha), `abierto por ${hito.abierto_por === user.id ? "ti" : (nombres.get(hito.abierto_por) ?? "—")}`]
            .filter((x) => x && x !== "—")
            .join(" · ")}
        </p>
        {hito.etiquetas_filtro.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {hito.etiquetas_filtro.map((eid) => (
              <Badge key={eid} tone="navy">{etiquetaNombre.get(eid) ?? "—"}</Badge>
            ))}
          </div>
        ) : null}
      </div>

      <HitoDetalle
        hitoId={hito.id}
        miembros={miembros.map((m) => ({
          ...m,
          contactadoPorNombre: m.contactado_por
            ? m.contactado_por === user.id
              ? "ti"
              : (nombres.get(m.contactado_por) ?? "otro empleado")
            : null,
        }))}
        candidatos={candidatos}
        puedeEliminar={puedeGestionar}
      />
    </div>
  );
}
