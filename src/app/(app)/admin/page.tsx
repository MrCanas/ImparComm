import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getCrm } from "@/lib/db/server";
import { listEtiquetas, nombresEmpleados } from "@/modules/crm/data";
import {
  BonosAdmin,
  ConfigAdmin,
  EtiquetasAdmin,
  PermisosAdmin,
  ResumenEquipo,
  type ResumenEmpleado,
} from "@/modules/crm/ui/AdminUI";

export const metadata = { title: "Administración" };

const TABS = [
  { key: "equipo", label: "Equipo" },
  { key: "etiquetas", label: "Etiquetas" },
  { key: "bonos", label: "Bonos" },
  { key: "permisos", label: "Permisos" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { db, user } = await getCrm();
  if (!user.isAdmin) notFound();
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "equipo";

  let contenido: React.ReactNode = null;

  if (tab === "equipo") {
    const { data, error } = await db.rpc("resumen_empleados");
    if (error) throw new Error(`resumen_empleados: ${error.message}`);
    contenido = <ResumenEquipo filas={(data ?? []) as ResumenEmpleado[]} />;
  }

  if (tab === "etiquetas") {
    const [etiquetas, usos, config] = await Promise.all([
      listEtiquetas(db),
      db.from("etiquetas_persona").select("etiqueta_id"),
      db.from("config").select("clave, valor"),
    ]);
    const conteo = new Map<string, number>();
    for (const u of (usos.data ?? []) as { etiqueta_id: string }[]) {
      conteo.set(u.etiqueta_id, (conteo.get(u.etiqueta_id) ?? 0) + 1);
    }
    const cfg = Object.fromEntries(((config.data ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, Number(c.valor)]));
    contenido = (
      <div className="space-y-6">
        <EtiquetasAdmin etiquetas={etiquetas.map((e) => ({ ...e, usos: conteo.get(e.id) ?? 0 }))} />
        <Config cfg={cfg} />
      </div>
    );
  }

  if (tab === "bonos") {
    const { data, error } = await db.from("bonos").select("id, empleado_id, fecha, importe, estado").order("fecha", { ascending: false });
    if (error) throw new Error(`bonos: ${error.message}`);
    const bonos = (data ?? []) as { id: string; empleado_id: string; fecha: string; importe: number; estado: string }[];
    const nombres = await nombresEmpleados(db, bonos.map((b) => b.empleado_id));
    contenido = <BonosAdmin bonos={bonos.map((b) => ({ ...b, empleado: nombres.get(b.empleado_id) ?? "—" }))} />;
  }

  if (tab === "permisos") {
    const { data, error } = await db.from("permisos").select("user_id, es_admin, ve_bolsa");
    if (error) throw new Error(`permisos: ${error.message}`);
    const filas = (data ?? []) as { user_id: string; es_admin: boolean; ve_bolsa: boolean }[];
    const nombres = await nombresEmpleados(db, filas.map((p) => p.user_id));
    contenido = <PermisosAdmin filas={filas.map((p) => ({ ...p, nombre: nombres.get(p.user_id) ?? p.user_id }))} />;
  }

  return (
    <>
      <PageHeader title="Administración" subtitle="Vista consolidada del equipo y configuración de ImparComm." />
      <nav className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" aria-label="Secciones">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
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

function Config({ cfg }: { cfg: Record<string, number> }) {
  return (
    <ConfigAdmin
      valores={{
        plazo_defecto_dias: cfg.plazo_defecto_dias ?? 90,
        puntos_por_bono: cfg.puntos_por_bono ?? 50,
        importe_bono: cfg.importe_bono ?? 100,
      }}
    />
  );
}
