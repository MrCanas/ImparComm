import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { Icon } from "@/components/ui/Icon";
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pendientes = await contarPendientes();
  const shellUser = {
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    canSeeBolsa: user.canSeeBolsa,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <AppHeader user={shellUser} pendientes={pendientes} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pt-4 pb-28 sm:px-4 lg:px-6 lg:pt-6 lg:pb-10">
        {children}
      </main>
      <Link
        href="/contactos/nuevo"
        aria-label="Añadir contacto"
        className="lg:hidden fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-icam-gold text-white shadow-lg transition active:scale-95 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        <Icon name="plus" className="h-7 w-7" strokeWidth={2.2} />
      </Link>
      <BottomNav pendientes={pendientes} />
      <footer className="hidden lg:block bg-icam-900 text-white/55 text-sm px-8 py-3">
        ImparComm · Impar Capital · Uso interno y confidencial.
      </footer>
    </div>
  );
}
