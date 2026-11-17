"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, ChevronRight, Lock, Plus, RefreshCcw, Sparkles, UserPlus, Users, X } from "lucide-react";
import { cx } from "@/components/ui";

/** Botão + do celular: abre os atalhos da agenda em cima do botão. */
export function AgendaFab({ day, full, variant = "agenda" }: { day: string; full: boolean; variant?: "agenda" | "turmas" }) {
  const [open, setOpen] = useState(false);
  if (variant === "turmas") return <TurmasSheet open={open} setOpen={setOpen} />;
  const items: { href: string; icon: typeof Lock; label: string; main?: boolean }[] = full
    ? [
        { href: `/agenda/nova?d=${day}`, icon: CalendarPlus, label: "Nova consulta", main: true },
        { href: "/horarios/novo", icon: Users, label: "Nova turma", main: true },
        { href: "/agenda/vagas?motivo=experimental", icon: Sparkles, label: "Aula experimental" },
        { href: "/agenda/vagas?motivo=reposicao", icon: RefreshCcw, label: "Repor aula" },
        { href: `/agenda/bloquear?d=${day}`, icon: Lock, label: "Bloquear horário" },
      ]
    : [{ href: `/agenda/bloquear?d=${day}`, icon: Lock, label: "Bloquear meu horário", main: false }];
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
              className={cx(
                "flex min-h-13 items-center gap-3 rounded-full py-2 pr-5 pl-2 text-[16px] font-semibold shadow-lg",
                "main" in i && i.main ? "bg-accent text-white" : "bg-surface",
              )}
              style={{ animation: `fab-in 160ms ease-out ${(items.length - n) * 25}ms both` }}
            >
              <span className={cx("grid size-9 place-items-center rounded-full", "main" in i && i.main ? "bg-white/20 text-white" : "bg-accent-soft text-accent")}>
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

const TURMAS = [
  { href: "/horarios/matricula", icon: UserPlus, title: "Nova matrícula", text: "Aluno, plano e turma, do jeito do dia a dia" },
  { href: "/agenda/vagas?motivo=reposicao", icon: RefreshCcw, title: "Repor aula", text: "Aluno com reposição: escolhe a vaga e pronto" },
  { href: "/agenda/vagas?motivo=experimental", icon: Sparkles, title: "Aula experimental", text: "Quem quer conhecer o estúdio antes de fechar" },
  { href: "/horarios/novo", icon: Users, title: "Nova turma", text: "Horário que se repete e já entra na agenda" },
];

/** Turmas: o + abre a janela "Adicionar" com as quatro opções explicadas. */
function TurmasSheet({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="lg:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Adicionar: matrícula, reposição, experimental ou turma"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid size-15 place-items-center rounded-2xl bg-accent text-white shadow-xl"
      >
        <Plus size={28} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby="add-title">
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full rounded-t-3xl bg-bg pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl" style={{ animation: "fab-in 160ms ease-out" }}>
            <div className="flex items-center justify-between rounded-t-3xl border-b border-line bg-surface px-5 py-4">
              <h2 id="add-title" className="text-[19px] font-semibold">
                Adicionar
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-hover">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2.5 px-4 pt-4">
              {TURMAS.map((i, n) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 active:bg-hover">
                  <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl", n === 0 ? "bg-accent text-white" : "bg-accent-soft text-accent")}>
                    <i.icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{i.title}</span>
                    <span className="block text-[13px] text-muted">{i.text}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
