"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS, isActive } from "@/components/layout/nav";
import { Icon } from "@/components/ui/Icon";

/**
 * Barra de pestañas inferior para móvil y tablet (oculta en ≥lg).
 * Lo que no cabe (bolsa común, administración, cerrar sesión) va en «Más».
 */
export function BottomNav({ pendientes }: { pendientes: number }) {
  const pathname = usePathname();
  const main = NAV_ITEMS.filter((i) => !i.mobileInMore);
  const moreActive =
    isActive(pathname, "/mas") ||
    NAV_ITEMS.some((i) => i.mobileInMore && isActive(pathname, i.href));

  const tabs = [...main, { href: "/mas", label: "Más", icon: "more" as const }];

  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-card/95 backdrop-blur pb-safe"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.href === "/mas" ? moreActive : isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? "text-icam-900" : "text-text-muted"
                }`}
              >
                {active ? (
                  <motion.span layoutId="tab-activa" className="absolute top-0 h-[3px] w-8 rounded-b bg-icam-gold" aria-hidden="true" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
                ) : null}
                <span className="relative">
                  <Icon name={tab.icon} className="h-6 w-6" strokeWidth={active ? 2.1 : 1.7} />
                  {tab.href === "/ritual" && pendientes > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-icam-gold px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                      {pendientes > 99 ? "99+" : pendientes}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
