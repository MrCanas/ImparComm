import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/LoginForm";
import { getCurrentUser } from "@/lib/auth/currentUser";

export const metadata = { title: "Acceso" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <LoginForm />;
}
