import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Solo visible para administradores / usuarios con permiso de bolsa común. */
  requires?: "admin" | "bolsa";
  /** En móvil no va en la barra inferior, sino en «Más». */
  mobileInMore?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/contactos", label: "Contactos", icon: "users" },
  { href: "/ritual", label: "Ritual", icon: "cards" },
  { href: "/hitos", label: "Hitos", icon: "flag" },
  { href: "/analiticas", label: "Analíticas", icon: "chart", mobileInMore: true },
  { href: "/bolsa", label: "Bolsa común", icon: "inbox", requires: "bolsa", mobileInMore: true },
  { href: "/admin", label: "Administración", icon: "shield", requires: "admin", mobileInMore: true },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
