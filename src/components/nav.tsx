"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutGrid, Repeat, Tags, Users } from "lucide-react";
import { cx } from "./ui";

/** Menu principal: os mesmos 5 itens no celular e no computador. O resto fica em "Mais". */
const ITEMS = [
  { href: "/agenda", label: "Hoje", icon: CalendarDays, match: ["/agenda"] },
  { href: "/pacientes", label: "Pacientes", icon: Users, match: ["/pacientes"] },
  { href: "/horarios", label: "Turmas", icon: Repeat, match: ["/horarios"] },
  { href: "/catalogo", label: "Catálogo", icon: Tags, match: ["/catalogo"] },
  { href: "/mais", label: "Mais", icon: LayoutGrid, match: ["/mais", "/financeiro", "/whatsapp", "/ajustes"] },
];

function useActive() {
  const path = usePathname();
  return (match: string[]) => match.some((m) => path === m || path.startsWith(m + "/"));
}

export function SideNav() {
  const isActive = useActive();
  return (
    <nav className="space-y-1" aria-label="Menu principal">
      {ITEMS.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(match) ? "page" : undefined}
          className={cx(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
            isActive(match) ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          <Icon size={20} strokeWidth={isActive(match) ? 2.2 : 1.8} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(match) ? "page" : undefined}
            className={cx(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium min-[380px]:text-[12px]",
              isActive(match) ? "text-accent" : "text-muted",
            )}
          >
            <Icon size={22} strokeWidth={isActive(match) ? 2.2 : 1.8} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
