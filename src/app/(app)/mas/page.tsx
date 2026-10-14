import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/Icon";
import { card } from "@/components/ui/styles";
import { getCrm } from "@/lib/db/server";
import { getPuntos } from "@/modules/crm/data";

export const metadata = { title: "Más" };

export default async function MasPage() {
  const { db, user } = await getCrm();
  const puntos = await getPuntos(db, user.id);

  const enlaces: { href: string; label: string; desc: string; icon: IconName; show: boolean }[] = [
    { href: "/contactos/nuevo", label: "Añadir contacto", desc: "Comidas y encuentros fuera del calendario", icon: "plus", show: true },
    { href: "/analiticas", label: "Analíticas", desc: "Tu juego: nivel, racha, logros y gráficas", icon: "chart", show: true },
    { href: "/bolsa", label: "Bolsa común", desc: "Contactos de antiguos empleados", icon: "inbox", show: user.canSeeBolsa },
    { href: "/admin", label: "Administración", desc: "Equipo, etiquetas, bonos y permisos", icon: "shield", show: user.isAdmin },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className={`${card} p-4`}>
        <p className="font-semibold text-text-primary">{user.name}</p>
        <p className="text-sm text-text-muted">{user.email}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-page p-3">
            <p className="text-xl font-semibold text-text-primary">{puntos.total}</p>
            <p className="text-xs text-text-muted">puntos</p>
          </div>
          <div className="rounded-md bg-page p-3">
            <p className="text-xl font-semibold text-text-primary">{puntos.bonos.length}</p>
            <p className="text-xs text-text-muted">bonos de {puntos.importeBono} €</p>
          </div>
        </div>
      </section>

      <ul className={`${card} divide-y divide-subtle/60`}>
        {enlaces
          .filter((e) => e.show)
          .map((e) => (
            <li key={e.href}>
              <Link href={e.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-page">
                <Icon name={e.icon} className="h-5 w-5 text-icam-900" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-text-primary">{e.label}</span>
                  <span className="block text-xs text-text-muted">{e.desc}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 text-text-muted" />
              </Link>
            </li>
          ))}
        <li>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-page">
              <Icon name="logout" className="h-5 w-5 text-red-700" />
              <span className="font-medium text-red-700">Cerrar sesión</span>
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
