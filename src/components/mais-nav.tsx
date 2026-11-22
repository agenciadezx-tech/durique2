"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  CalendarSync,
  ChartPie,
  ChevronRight,
  CircleCheckBig,
  ClipboardList,
  FileText,
  Globe,
  HandCoins,
  Layers,
  Magnet,
  MessageCircle,
  PlayCircle,
  ReceiptText,
  Settings2,
  Target,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MaisGroup, MaisTone } from "@/lib/mais-menu";
import { cx } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  pie: ChartPie,
  target: Target,
  wallet: Wallet,
  coins: HandCoins,
  users: UsersRound,
  receipt: ReceiptText,
  globe: Globe,
  magnet: Magnet,
  bell: BellRing,
  message: MessageCircle,
  clipboard: ClipboardList,
  play: PlayCircle,
  layers: Layers,
  check: CircleCheckBig,
  calendar: CalendarSync,
  settings: Settings2,
};

/** Cada grupo tem sua cor de ícone (fixa, não muda com a cor da clínica) para achar rápido. */
const TONE: Record<MaisTone, string> = {
  violet: "bg-[#f1ecfd] text-[#6d3fd1]",
  green: "bg-[#e7f6ec] text-[#16803c]",
  sky: "bg-[#e6f2fb] text-[#1f6fb2]",
  amber: "bg-[#fdf1e3] text-[#b45d0b]",
};

/** Lista do "Mais". No computador fica fixa à esquerda e marca a seção aberta. */
export function MaisNav({ groups, compact }: { groups: MaisGroup[]; compact?: boolean }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  // a seção ativa é a de caminho mais longo que combina (ex.: /financeiro/saude ganha de /financeiro)
  const active = all.filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  return (
    <div className={compact ? "space-y-5" : "space-y-8"}>
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.title}</h2>
          <div className={compact ? "space-y-1" : "grid gap-2 sm:grid-cols-2"}>
            {g.items.map(({ href, icon, title, text, mobileOnly }) => {
              const tone = TONE[g.tone] ?? TONE.green;
              const Icon = ICONS[icon] ?? FileText;
              const on = href === active;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-2xl transition-colors",
                    mobileOnly && "lg:hidden",
                    compact ? "p-2.5" : "border border-line bg-surface p-4",
                    on ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span
                    className={cx(
                      "grid shrink-0 place-items-center rounded-xl",
                      compact ? "size-10" : "size-11",
                      on ? "bg-accent text-white" : tone,
                    )}
                  >
                    <Icon size={compact ? 19 : 21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block font-medium", compact && "text-[15px]")}>{title}</span>
                    <span className={cx("block text-muted", compact ? "truncate text-[13px]" : "text-sm")}>{text}</span>
                  </span>
                  <ChevronRight size={compact ? 16 : 18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
