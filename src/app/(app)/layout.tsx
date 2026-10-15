import { redirect } from "next/navigation";

import { FxProvider } from "@/components/fx/FxProvider";
import { AddFab } from "@/components/layout/AddFab";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser, haySesionFirmada } from "@/lib/auth/currentUser";
import { getCrm } from "@/lib/db/server";
import { hoyMadrid } from "@/lib/format";
import { getCabecera } from "@/modules/crm/data";
import { rachaDe } from "@/modules/crm/gamificacion";

/** Pendientes del ritual y racha, en un solo RPC (antes eran dos consultas y la racha traía filas sueltas). */
async function cabecera(): Promise<{ pendientes: number; racha: number }> {
  try {
    const { db } = await getCrm();
    const c = await getCabecera(db);
    return { pendientes: c.pendientes, racha: rachaDe(c.dias_activos, hoyMadrid()).actual };
  } catch {
    return { pendientes: 0, racha: 0 };
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Cookie válida pero cuenta de baja o borrada: hay que invalidar la cookie, o el
  // proxy devolvería /login → / y la app / → /login sin fin.
  if (!user) redirect((await haySesionFirmada()) ? "/login?motivo=sesion" : "/login");

  const { pendientes, racha } = await cabecera();
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
