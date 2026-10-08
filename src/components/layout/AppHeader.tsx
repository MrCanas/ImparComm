"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAV_ITEMS, isActive } from "@/components/layout/nav";
import type { ShellUser } from "@/components/layout/types";

export function initials(name: string, email: string): string {
  const parts = (name || email).trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : (parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

/**
 * Cabecera con el look de icam: barra navy de 56px con el logo y, en escritorio,
 * una segunda fila de navegación horizontal con subrayado dorado.
 * En móvil la navegación vive en la barra inferior (BottomNav).
 */
export function AppHeader({ user, pendientes }: { user: ShellUser; pendientes: number }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (i) => !i.requires || (i.requires === "admin" ? user.isAdmin : user.canSeeBolsa),
  );

  return (
    <header className="sticky top-0 z-40 bg-icam-900 shrink-0 flex flex-col border-b border-white/10 pt-safe">
      <div className="h-14 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 min-w-0">
        <Link href="/" className="flex items-center gap-3 min-w-0" aria-label="Inicio">
          <Image
            src="/IMPAR_CAPITAL_white.png"
            alt="Impar Capital"
            width={180}
            height={32}
            className="h-6 sm:h-7 w-auto max-w-[130px] sm:max-w-[180px] object-contain object-left mix-blend-lighten"
            priority
          />
          <span className="hidden sm:inline h-5 w-px bg-white/20" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-wide text-icam-gold">ImparComm</span>
        </Link>

        <UserMenu user={user} />
      </div>

      <nav
        className="hidden lg:flex px-8 pt-1 flex-wrap items-center justify-center gap-x-6 gap-y-1"
        aria-label="Navegación principal"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`pb-2 text-sm font-medium transition inline-flex items-center gap-1.5 ${
                active
                  ? "text-white border-b-[3px] border-icam-gold"
                  : "text-white/60 hover:text-white/90 border-b-[3px] border-transparent"
              }`}
            >
              {item.label}
              {item.href === "/ritual" && pendientes > 0 ? (
                <span className="rounded-full bg-icam-gold px-1.5 text-[11px] font-semibold text-white">
                  {pendientes}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de usuario"
        className="flex h-11 w-11 items-center justify-center rounded-full"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white transition hover:bg-white/20">
          {initials(user.name, user.email)}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-subtle/50 bg-card py-1 shadow-lg"
        >
          <div className="border-b border-subtle/40 px-3 pb-2 pt-1">
            <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="block w-full min-h-11 px-3 py-2 text-left text-sm text-text-body hover:bg-page transition"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
