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
  { href: "/catalogo", label: "Catálogo", icon: Tags, match: ["/catalogo"], desktopOnly: true },
  { href: "/mais", label: "Mais", icon: LayoutGrid, match: ["/mais", "/financeiro", "/whatsapp", "/ajustes", "/contatos", "/atendimentos", "/equipe"] },
];

function useActive() {
  const path = usePathname();
  return (match: string[]) => match.some((m) => path === m || path.startsWith(m + "/"));
}

export function SideNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const isActive = useActive();
  const on = tone === "light" ? "bg-white/20 text-white" : "bg-black/10 text-black";
  const off = tone === "light" ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-black/60 hover:bg-black/5 hover:text-black";
  return (
    <nav className="space-y-1.5" aria-label="Menu principal">
      {ITEMS.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(match) ? "page" : undefined}
          className={cx(
            "flex flex-col items-center gap-1 rounded-xl py-2.5 text-[12px] font-medium transition-colors",
            isActive(match) ? on : off,
          )}
        >
          <Icon size={22} strokeWidth={isActive(match) ? 2.2 : 1.8} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useActive();
  // No celular o Catálogo fica dentro do Mais
  const items = ITEMS.filter((i) => !i.desktopOnly).map((i) => (i.href === "/mais" ? { ...i, match: [...i.match, "/catalogo"] } : i));
  return (
    <nav
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map(({ href, label, icon: Icon, match }) => (
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
