"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Plus, Repeat, X, XCircle } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { addEnrollment, cancelMembership, leaveEnrollment, swapEnrollment } from "../actions";

export type Enr = { id: string; label: string; sub: string };
export type Opt = { id: string; label: string; sub: string; free: number };

/** "Gerir": plano, horários fixos (sair, trocar, adicionar) e cancelar matrícula, numa janela só. */
export function ManageClasses({
  patientId,
  plan,
  late,
  enrollments,
  options,
  startedOn,
}: {
  patientId: string;
  plan: { id: string; name: string; price_cents: number } | null;
  late: number;
  enrollments: Enr[];
  options: Opt[];
  startedOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "turmas" | { swap: string } | "add">("main");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const run = (fn: () => Promise<{ ok?: string; error?: string }>, back: typeof view = "turmas") =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) setView(back);
    });

  const row = (icon: React.ReactNode, title: string, sub: string, onClick?: () => void, href?: string, tone?: "bad") => {
    const inner = (
      <>
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tone === "bad" ? "bg-bad-soft text-bad" : "bg-hover text-muted")}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("block font-semibold", tone === "bad" && "text-bad")}>{title}</span>
          <span className="block text-[13px] text-muted">{sub}</span>
        </span>
        {(onClick || href) && <ChevronRight size={18} className="shrink-0 text-faint" />}
      </>
    );
    const cls = "flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left hover:bg-hover";
    return href ? (
      <Link href={href} className={cls} onClick={() => setOpen(false)}>
        {inner}
      </Link>
    ) : onClick ? (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    ) : (
      <div className={cls}>{inner}</div>
    );
  };

  const pick = (title: string, onPick: (id: string) => void, exclude: string[] = []) => (
    <div className="space-y-3">
      <button type="button" onClick={() => setView("turmas")} className="inline-flex items-center gap-1 text-sm font-medium text-muted">
        <ChevronLeft size={16} /> Voltar
      </button>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {options.filter((o) => !exclude.includes(o.id)).length === 0 ? (
        <p className="rounded-xl bg-hover px-3 py-3 text-sm text-muted">Nenhuma outra turma disponível. Crie em Turmas › Nova turma.</p>
      ) : (
        options
          .filter((o) => !exclude.includes(o.id))
          .map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={o.free <= 0 || pending}
              onClick={() => onPick(o.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left hover:bg-hover disabled:opacity-50"
            >
              <CalendarDays size={18} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{o.label}</span>
                <span className="block truncate text-[13px] text-muted">{o.sub}</span>
              </span>
              <span className={cx("text-[12px] font-semibold", o.free <= 0 ? "text-warn" : "text-muted")}>{o.free <= 0 ? "lotada" : `${o.free} vaga${o.free === 1 ? "" : "s"}`}</span>
            </button>
          ))
      )}
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => (setOpen(true), setView("main"), setMsg(null))} className={buttonClass("secondary", "sm")}>
        Gerir
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="mc-title">
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
            <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-bg shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
              <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 pt-5 pb-4">
                <div className="min-w-0">
                  <h2 id="mc-title" className="text-[19px] font-semibold">
                    Gerir aulas
                  </h2>
                  <p className="truncate text-sm text-muted">{plan?.name ?? "Turmas fixas"}</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                {msg?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{msg.error}</p>}
                {msg?.ok && <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-medium text-ok">{msg.ok}</p>}

                {view === "main" && (
                  <>
                    {plan && (
                      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-4">
                        <span className="text-[24px] font-semibold tabular-nums">
                          {formatMoney(plan.price_cents)}
                          <span className="text-[14px] font-normal text-muted">/mês</span>
                        </span>
                        <span className={cx("rounded-full px-3 py-1 text-[13px] font-semibold", late ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>
                          {late ? `${formatMoney(late)} atrasado` : "em dia"}
                        </span>
                      </div>
                    )}
                    <p className="pt-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Plano</p>
                    {row(<LayoutGrid size={18} />, "Plano e horários", enrollments.length ? enrollments.map((e) => e.label).join(" · ") : "Nenhum horário fixo ainda", () => setView("turmas"))}
                    {row(<Repeat size={18} />, plan ? "Trocar plano" : "Escolher um plano", "Mensal, 2x ou 3x por semana…", undefined, `/pacientes/${patientId}/vender?tipo=plano`)}
                    <p className="pt-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Histórico</p>
                    {startedOn && row(<CalendarDays size={18} />, "Começou em", startedOn.split("-").reverse().join("/"))}
                    {(plan || enrollments.length > 0) &&
                      row(<XCircle size={18} />, "Cancelar matrícula", "Sai de todas as turmas e encerra o plano. O histórico fica guardado.", () => {
                        if (confirm("Cancelar a matrícula? O aluno sai das turmas fixas (as vagas das próximas aulas ficam livres) e o plano é encerrado."))
                          run(() => cancelMembership(patientId, plan?.id ?? null), "main");
                      }, undefined, "bad")}
                  </>
                )}

                {view === "turmas" && (
                  <>
                    <button type="button" onClick={() => setView("main")} className="inline-flex items-center gap-1 text-sm font-medium text-muted">
                      <ChevronLeft size={16} /> Voltar
                    </button>
                    <h3 className="text-[17px] font-semibold">Plano e horários</h3>
                    <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Turmas de agora</p>
                    {enrollments.length === 0 && <p className="rounded-xl bg-hover px-3 py-3 text-sm text-muted">Nenhum horário fixo.</p>}
                    {enrollments.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                          <CalendarDays size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{e.label}</span>
                          <span className="block truncate text-[13px] text-muted">{e.sub}</span>
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => confirm(`Tirar do horário ${e.label}? As próximas aulas desse horário ficam livres.`) && run(() => leaveEnrollment(patientId, e.id))}
                          className={buttonClass("secondary", "sm")}
                        >
                          Sair
                        </button>
                        <button type="button" disabled={pending} onClick={() => setView({ swap: e.id })} className={buttonClass("secondary", "sm")}>
                          Trocar
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setView("add")}
                      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 font-semibold text-accent hover:bg-accent-soft/40"
                    >
                      <Plus size={18} /> Adicionar horário
                    </button>
                  </>
                )}

                {view === "add" && pick("Adicionar horário", (sid) => run(() => addEnrollment(patientId, sid)))}
                {typeof view === "object" && pick("Trocar por qual horário?", (sid) => run(() => swapEnrollment(patientId, view.swap, sid)))}
                {pending && <p className="text-center text-sm text-muted">Salvando…</p>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
