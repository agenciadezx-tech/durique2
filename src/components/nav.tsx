"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Repeat, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/horarios", label: "Horários fixos", short: "Horários", icon: Repeat },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

export function SideNav() {
  const isActive = useActive();
  return (
    <nav className="space-y-1" aria-label="Menu principal">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cx(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
            isActive(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          <Icon size={20} strokeWidth={isActive(href) ? 2.2 : 1.8} />
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, short, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cx(
              "flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium",
              isActive(href) ? "text-accent" : "text-muted",
            )}
          >
            <Icon size={22} strokeWidth={isActive(href) ? 2.2 : 1.8} />
            {short ?? label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
