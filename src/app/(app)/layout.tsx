import { redirect } from "next/navigation";

import { FxProvider } from "@/components/fx/FxProvider";
import { AddFab } from "@/components/layout/AddFab";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getCrm } from "@/lib/db/server";

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

/** XP para la insignia de nivel de la cabecera: puntos del ritual + contactos en hitos. */
async function contarXp(): Promise<number> {
  try {
    const { db, user } = await getCrm();
    const [puntos, contactos] = await Promise.all([
      db.from("puntos").select("delta").eq("empleado_id", user.id),
      db.from("hito_persona").select("persona_id", { count: "exact", head: true }).eq("contactado_por", user.id).eq("estado", "contactado"),
    ]);
    const total = ((puntos.data ?? []) as { delta: number }[]).reduce((s, p) => s + p.delta, 0);
    return total + (contactos.count ?? 0);
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [pendientes, xp] = await Promise.all([contarPendientes(), contarXp()]);
  const shellUser = {
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    canSeeBolsa: user.canSeeBolsa,
  };

  return (
    <FxProvider>
    <div className="flex min-h-dvh flex-col bg-page">
      <AppHeader user={shellUser} pendientes={pendientes} xp={xp} />
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
