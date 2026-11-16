"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, MessageCircle, Repeat, Users, Wallet } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/horarios", label: "Turmas", icon: Repeat },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, finance: true },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, finance: true, desktopOnly: true },
  { href: "/ajustes", label: "Minha clínica", short: "Clínica", icon: Building2 },
];

function items(showFinance: boolean) {
  return ITEMS.filter((i) => showFinance || !("finance" in i));
}

function useActive() {
  const path = usePathname();
  const hrefs = ITEMS.map((i) => i.href);
  // Destaca só o item mais específico que bate com a página atual
  const best = hrefs.filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  return (href: string) => href === best;
}

export function SideNav({ showFinance }: { showFinance: boolean }) {
  const isActive = useActive();
  return (
    <nav className="space-y-1" aria-label="Menu principal">
      {items(showFinance).map(({ href, label, icon: Icon }) => (
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

export function BottomNav({ showFinance }: { showFinance: boolean }) {
  const isActive = useActive();
  const list = items(showFinance).filter((i) => !("desktopOnly" in i));
  return (
    <nav
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-30 print:hidden border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className={cx("mx-auto grid max-w-lg", list.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {list.map(({ href, label, short, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cx(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium min-[380px]:text-[12px]",
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
