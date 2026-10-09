"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";

/** Botón flotante «Añadir contacto» en móvil. Se oculta donde estorba (ritual, formularios). */
export function AddFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/ritual") || pathname.endsWith("/nuevo")) return null;
  return (
    <Link
      href="/contactos/nuevo"
      aria-label="Añadir contacto"
      className="lg:hidden fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-icam-gold text-white shadow-lg transition active:scale-95 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
    >
      <Icon name="plus" className="h-7 w-7" strokeWidth={2.2} />
    </Link>
  );
}
