"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { Archive, Bell, BellOff, CalendarDays, ClipboardList, Dumbbell, FileSignature, MessageCircle, NotebookPen, Package, Pencil, Plus, X } from "lucide-react";

const ICONS = { Archive, CalendarDays, ClipboardList, Dumbbell, FileSignature, MessageCircle, NotebookPen, Package, Pencil } satisfies Record<string, LucideIcon>;
import { buttonClass, cx } from "@/components/ui";
import { setSkipConfirmation } from "../actions";

/** Sino ao lado do nome: dispensa (ou volta a pedir) a confirmação de presença. */
export function ConfirmBell({ id, skip, canEdit }: { id: string; skip: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        title={skip ? "Não pede confirmação de presença" : "Pede confirmação de presença"}
        aria-label={skip ? "Confirmação de presença dispensada. Tocar para voltar a pedir" : "Dispensar confirmação de presença"}
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-xl border transition-colors",
          skip ? "border-warn/30 bg-warn-soft text-warn" : "border-line bg-surface text-muted hover:text-ink",
        )}
      >
        {skip ? <BellOff size={18} /> : <Bell size={18} />}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bell-title">
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/35" />
          <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <h2 id="bell-title" className="text-[18px] font-semibold">
                {skip ? "Voltar a pedir confirmação?" : "Não pedir confirmação de presença?"}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-hover">
                <X size={20} />
              </button>
            </div>
            <p className="bg-bg px-5 py-4 text-[15px] leading-relaxed text-muted">
              {skip
                ? "O paciente volta a aparecer nos lembretes do WhatsApp e no aviso “Em risco” quando não confirmar."
                : "Bom para quem vem sempre no mesmo horário ou tem dificuldade com o celular. A vaga continua reservada, o paciente sai dos lembretes de confirmação e não aparece como “Em risco”. Dá para voltar atrás quando quiser."}
            </p>
            {error && <p className="px-5 pt-3 text-sm text-bad">{error}</p>}
            <div className="flex justify-end gap-2 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "md")}>
                Voltar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setSkipConfirmation(id, !skip);
                    if (r.error) setError(r.error);
                    else setOpen(false);
                  })
                }
                className={buttonClass("primary", "md")}
              >
                {pending ? "Aguarde…" : skip ? "Voltar a pedir" : "Não pedir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type MenuItem = { href: string; label: string; icon: keyof typeof ICONS; hint?: string; disabled?: boolean; tone?: "bad"; external?: boolean };

/** Botão + da ficha: tudo que dá para fazer com o paciente, num lugar só. */
export function PatientMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Ações do paciente"
        className={cx("grid size-12 place-items-center rounded-2xl bg-accent text-white shadow-sm transition-transform", open && "rotate-45")}
      >
        <Plus size={24} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-xl" style={{ animation: "fab-in 140ms ease-out" }}>
          {items.map((i) => {
            const Icon = ICONS[i.icon];
            return             i.disabled ? (
              <div key={i.label} className="flex items-start gap-3 px-4 py-2.5 text-faint">
                <Icon size={19} className="mt-0.5 shrink-0" />
                <span>
                  <span className="block text-[15px]">{i.label}</span>
                  {i.hint && <span className="block text-[12px]">{i.hint}</span>}
                </span>
              </div>
            ) : (
              <Link
                key={i.label}
                href={i.href}
                target={i.external ? "_blank" : undefined}
                onClick={() => setOpen(false)}
                className={cx("flex min-h-12 items-center gap-3 px-4 py-2 text-[15px] hover:bg-hover", i.tone === "bad" ? "text-bad" : "text-ink")}
              >
                <Icon size={19} className={cx("shrink-0", i.tone === "bad" ? "text-bad" : "text-muted")} />
                <span>
                  <span className="block">{i.label}</span>
                  {i.hint && <span className="block text-[12px] text-muted">{i.hint}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
