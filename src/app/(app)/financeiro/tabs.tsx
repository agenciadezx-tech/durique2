"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function FinanceTabs({ showCommissions }: { showCommissions: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/financeiro", label: "Resumo" },
    { href: "/financeiro/lancamentos", label: "Lançamentos" },
    ...(showCommissions
      ? [
          { href: "/financeiro/comissoes", label: "Comissões" },
          { href: "/financeiro/relatorios", label: "Relatórios" },
        ]
      : []),
  ];
  if (path === "/financeiro/novo") return null;
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções do financeiro">
      {tabs.map((t) => {
        const active = t.href === "/financeiro" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-3 text-[15px] font-medium whitespace-nowrap transition-colors",
              active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
