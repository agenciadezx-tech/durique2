"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Lock, Plus, RefreshCcw, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";

/** Botão + do celular: abre os atalhos da agenda em cima do botão. */
export function AgendaFab({ day, full }: { day: string; full: boolean }) {
  const [open, setOpen] = useState(false);
  const items = full
    ? [
        { href: `/agenda/bloquear?d=${day}`, icon: Lock, label: "Bloquear horário" },
        { href: "/agenda/vagas?motivo=experimental", icon: Sparkles, label: "Aula experimental" },
        { href: "/agenda/vagas?motivo=reposicao", icon: RefreshCcw, label: "Repor aula" },
        { href: `/agenda/nova?d=${day}`, icon: CalendarPlus, label: "Agendar" },
      ]
    : [{ href: `/agenda/bloquear?d=${day}`, icon: Lock, label: "Bloquear meu horário" }];
  return (
    <div className="lg:hidden print:hidden">
      {open && <button type="button" aria-label="Fechar atalhos" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-ink/35" />}
      <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3">
        {open &&
          items.map((i, n) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className="flex min-h-13 items-center gap-3 rounded-full bg-surface py-2 pr-5 pl-2 text-[16px] font-semibold shadow-lg"
              style={{ animation: `fab-in 160ms ease-out ${(items.length - n) * 25}ms both` }}
            >
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                <i.icon size={18} />
              </span>
              {i.label}
            </Link>
          ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Fechar atalhos" : "Agendar, bloquear e outros atalhos"}
          className={cx("grid size-15 place-items-center rounded-2xl bg-accent text-white shadow-xl transition-transform", open && "rotate-45")}
        >
          {open ? <X size={26} className="-rotate-45" /> : <Plus size={28} />}
        </button>
      </div>
    </div>
  );
}
