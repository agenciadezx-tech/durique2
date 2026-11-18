"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { buttonClass, cx, Field, Input } from "@/components/ui";
import { createInvite } from "../ajustes/actions";

const ROLES = [
  { v: "admin", t: "Administrador", d: "Vê e muda tudo: configurações, equipe, financeiro e prontuário." },
  { v: "profissional", t: "Profissional", d: "Atende: vê a própria agenda e o prontuário de quem atende. Sem financeiro nem configurações." },
  { v: "recepcao", t: "Recepção", d: "Marca consultas, cadastra pacientes, recebe e cobra. Não vê prontuário nem configurações." },
  { v: "financeiro", t: "Financeiro", d: "Contas a pagar e receber, resultado e comissões. Não mexe na agenda." },
] as const;

/** Botão "Convidar membro" + janela de baixo com nome, e-mail, WhatsApp, papel e "já entra atendendo". */
export function InviteSheet({ full }: { full?: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("profissional");
  const [attends, setAttends] = useState(true);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass("primary", "lg", full))}>
        <UserPlus size={19} /> Convidar membro
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="inv-title">
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
            <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-bg shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
              <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
                <div className="min-w-0">
                  <h2 id="inv-title" className="text-[19px] font-semibold">
                    Convidar membro
                  </h2>
                  <p className="text-[14px] text-muted">A pessoa recebe um link para criar a senha e já entra nesta clínica.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover">
                  <X size={20} />
                </button>
              </div>
              <ActionForm action={createInvite} className="flex min-h-0 flex-1 flex-col space-y-0!">
                <input type="hidden" name="back" value="equipe" />
                <input type="hidden" name="role" value={role} />
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <Field label="Nome">
                    <Input name="name" required placeholder="Nome completo" autoComplete="off" />
                  </Field>
                  <Field label="E-mail">
                    <Input name="email" type="email" required placeholder="email@exemplo.com" autoComplete="off" />
                  </Field>
                  <Field label="WhatsApp (recomendado)" hint="Com o WhatsApp, você manda o link do convite por lá com um toque. É por onde a pessoa costuma abrir.">
                    <Input name="phone" type="tel" inputMode="tel" placeholder="(11) 99999-9999" />
                  </Field>
                  <fieldset>
                    <legend className="mb-2 text-[14px] font-semibold text-accent">Papel</legend>
                    <div className="space-y-2">
                      {ROLES.map((r) => (
                        <button
                          key={r.v}
                          type="button"
                          aria-pressed={role === r.v}
                          onClick={() => {
                            setRole(r.v);
                            setAttends(r.v === "profissional" ? true : r.v === "admin" ? attends : false);
                          }}
                          className={cx(
                            "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                            role === r.v ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
                          )}
                        >
                          <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", role === r.v ? "border-accent" : "border-faint")}>
                            {role === r.v && <span className="size-2.5 rounded-full bg-accent" />}
                          </span>
                          <span>
                            <span className={cx("block font-semibold", role === r.v && "text-accent")}>{r.t}</span>
                            <span className="block text-[14px] text-muted">{r.d}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {(role === "profissional" || role === "admin") && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                      <input type="checkbox" name="attends" checked={attends} onChange={(e) => setAttends(e.target.checked)} className="peer sr-only" />
                      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", attends ? "bg-ok" : "bg-line")}>
                        <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", attends ? "left-6" : "left-1")} />
                      </span>
                      <span>
                        <span className="block font-semibold">Já entra atendendo (aparece na agenda)</span>
                        <span className="block text-[14px] text-muted">Serviços, comissão e cor você ajusta depois, tocando na pessoa.</span>
                      </span>
                    </label>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
                    Cancelar
                  </button>
                  <SubmitButton size="lg" pendingText="Criando…">
                    <UserPlus size={18} /> Enviar convite
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
