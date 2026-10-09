"use client";

import { btn } from "@/components/ui/styles";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-card p-6 text-center">
      <p className="font-medium text-text-primary">No se ha podido cargar esta página</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-text-muted break-words">{error.message}</p>
      <button type="button" onClick={reset} className={`${btn.secondary} mt-4`}>
        Reintentar
      </button>
    </div>
  );
}
