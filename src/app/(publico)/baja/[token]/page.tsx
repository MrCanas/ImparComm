import { notFound } from "next/navigation";

import { buscarPorToken } from "@/lib/eventos/publico";

import { BotonBaja } from "./BotonBaja";

/** Baja: abrir el enlace no da de baja (los antivirus lo abren); hay que confirmar. */
export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await buscarPorToken(token);
  if (!datos) notFound();
  return (
    <article className="space-y-6 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
      <h1 className="font-[family-name:var(--font-titulo)] text-xl uppercase tracking-[0.12em] text-[#1E2A56]">Darse de baja</h1>
      <p className="text-sm">
        Dejarás de recibir invitaciones y comunicaciones de eventos de Impar Capital en <strong>{datos.invitado.email}</strong>.
      </p>
      <BotonBaja token={token} />
    </article>
  );
}
