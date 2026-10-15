import { redirect } from "next/navigation";

import { FxProvider } from "@/components/fx/FxProvider";
import { AddFab } from "@/components/layout/AddFab";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getCrm } from "@/lib/db/server";
import { hoyMadrid } from "@/lib/format";
import { rachaDe } from "@/modules/crm/gamificacion";

async function contarPendientes(): Promise<number> {
  try {
    const { db, user } = await getCrm();
    const { count } = await db
      .from("relaciones")
      .select("id", { count: "exact", head: true })
      .eq("empleado_id", user.id)
      .eq("estado", "nueva");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Racha para la cabecera: días seguidos con contactos en hitos o clasificaciones. */
async function calcularRacha(): Promise<number> {
  try {
    const { db, user } = await getCrm();
    const desde = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const [eventos, puntos] = await Promise.all([
      db.from("hito_eventos").select("created_at").eq("empleado_id", user.id).in("accion", ["contactar", "incluir"]).gte("created_at", desde),
      db.from("puntos").select("created_at").eq("empleado_id", user.id).gt("delta", 0).gte("created_at", desde),
    ]);
    const dias = [...(eventos.data ?? []), ...(puntos.data ?? [])].map((r) => (r.created_at as string).slice(0, 10));
    return rachaDe(dias, hoyMadrid()).actual;
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [pendientes, racha] = await Promise.all([contarPendientes(), calcularRacha()]);
  const shellUser = {
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    canSeeBolsa: user.canSeeBolsa,
  };

  return (
    <FxProvider>
    <div className="flex min-h-dvh flex-col bg-page">
      <AppHeader user={shellUser} pendientes={pendientes} racha={racha} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pt-4 pb-28 sm:px-4 lg:px-6 lg:pt-6 lg:pb-10">
        {children}
      </main>
      <AddFab />
      <BottomNav pendientes={pendientes} />
      <footer className="hidden lg:block bg-icam-900 text-white/55 text-sm px-8 py-3">
        ImparComm · Impar Capital · Uso interno y confidencial.
      </footer>
    </div>
    </FxProvider>
  );
}
