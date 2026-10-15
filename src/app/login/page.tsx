import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/LoginForm";
import { getCurrentUser } from "@/lib/auth/currentUser";

export const metadata = { title: "Acceso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <LoginForm aviso={motivo === "sesion" ? "Tu sesión ya no es válida. Vuelve a entrar." : undefined} />;
}
