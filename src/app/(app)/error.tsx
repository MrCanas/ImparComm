"use client";

import { btn } from "@/components/ui/styles";

/**
 * `retry` vuelve a pedir los datos del segmento (el antiguo `reset` solo
 * re-renderizaba, así que «Reintentar» no recuperaba nada). El mensaje interno
 * no se muestra: va al log con el `digest` para poder buscarlo.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-card p-6 text-center">
      <p className="font-medium text-text-primary">No se ha podido cargar esta página</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-text-muted">
        Vuelve a intentarlo en unos segundos. Si sigue fallando, avisa con este código:{" "}
        <code className="text-xs">{error.digest ?? "sin código"}</code>
      </p>
      <button type="button" onClick={() => retry()} className={`${btn.secondary} mt-4`}>
        Reintentar
      </button>
    </div>
  );
}
