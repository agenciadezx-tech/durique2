"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { buttonClass, cx, Input } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/format";
import { savePlanRow } from "./actions";

/** Escolha em cartões (um só), como rádio. */
export function ChoiceCards({ name, options, value, cols = 2 }: { name: string; options: { v: string; t: string; d?: string }[]; value: string; cols?: 1 | 2 | 3 }) {
  const [v, setV] = useState(value);
  return (
    <div className={cx("grid gap-2", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      <input type="hidden" name={name} value={v} />
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={v === o.v}
          onClick={() => setV(o.v)}
          className={cx(
            "rounded-2xl border px-4 py-3 text-left transition-colors",
            v === o.v ? "border-ok bg-ok-soft" : "border-line bg-surface hover:bg-hover",
          )}
        >
          <span className={cx("block font-semibold", v === o.v && "text-ok")}>{o.t}</span>
          {o.d && <span className="block text-[14px] text-muted">{o.d}</span>}
        </button>
      ))}
    </div>
  );
}

/** Chave liga/desliga com título e explicação (checkbox de verdade, vai no formulário). */
export function Toggle({ name, defaultChecked, title, desc, onChange }: { name: string; defaultChecked?: boolean; title: string; desc?: string; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(!!defaultChecked);
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors", on ? "border-ok/30 bg-ok-soft/60" : "border-line bg-surface")}>
      <input
        type="checkbox"
        name={name}
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className="sr-only"
      />
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-ok" : "bg-line")}>
        <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {desc && <span className="block text-[14px] text-muted">{desc}</span>}
      </span>
    </label>
  );
}

/** Mostra/esconde um pedaço do formulário conforme uma chave. */
export function ToggleSection({ name, defaultChecked, title, desc, children }: { name: string; defaultChecked?: boolean; title: string; desc?: string; children: React.ReactNode }) {
  const [on, setOn] = useState(!!defaultChecked);
  return (
    <div className="space-y-3">
      <Toggle name={name} defaultChecked={defaultChecked} title={title} desc={desc} onChange={setOn} />
      {on && <div className="ml-3 border-l-2 border-line pl-4">{children}</div>}
    </div>
  );
}

const CYC = [
  { c: 3, l: "Trimestral", s: "Tri" },
  { c: 6, l: "Semestral", s: "Sem" },
  { c: 12, l: "Anual", s: "Anual" },
] as const;
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** "+ Novo plano": 1) frequência, formato e aulas por mês · 2) valor por ciclo (mensal obrigatório). */
export function PlanWizard({ serviceId, serviceName, taken }: { serviceId: string; serviceName: string; taken: string[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [perWeek, setPerWeek] = useState(0);
  const [format, setFormat] = useState<"grupo" | "individual">("grupo");
  const [perMonth, setPerMonth] = useState("");
  const [base, setBase] = useState("");
  const [cyc, setCyc] = useState<Record<number, string>>({});
  const saved = useSearchParams().get("salvo");
  useEffect(() => {
    if (saved) {
      setOpen(false);
      setStep(1);
      setPerWeek(0);
      setBase("");
      setCyc({});
    }
  }, [saved]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const missing = [!perWeek && "frequência", !base && step === 2 && "valor mensal"].filter(Boolean);
  const dup = perWeek > 0 && taken.includes(`${perWeek}|${format}`);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-dashed border-line px-4 text-[15px] font-semibold text-ok hover:bg-hover">
        <Plus size={17} /> Novo plano
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
            <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-bg shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
              <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
                <div>
                  <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{serviceName} · Mensalidade</p>
                  <h2 className="text-[19px] font-semibold">Novo plano</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-hover">
                  <X size={20} />
                </button>
              </div>
              <ActionForm action={savePlanRow} className="flex min-h-0 flex-1 flex-col space-y-0!">
                <input type="hidden" name="service_id" value={serviceId} />
                <input type="hidden" name="close" value="1" />
                <input type="hidden" name="sessions_per_week" value={perWeek || ""} />
                <input type="hidden" name="format" value={format} />
                <input type="hidden" name="classes_per_month" value={perMonth} />
                <input type="hidden" name="p1" value={base} />
                {CYC.map((x) => (
                  <input key={x.c} type="hidden" name={`p${x.c}`} value={cyc[x.c] ?? ""} />
                ))}
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
                  {/* Passo 1 */}
                  <section className={cx("rounded-2xl border bg-surface", step === 1 ? "border-accent p-4" : "border-line px-4 py-3")}>
                    <button type="button" onClick={() => setStep(1)} className="flex w-full items-center gap-3 text-left">
                      <span className={cx("grid size-8 place-items-center rounded-full text-[14px] font-semibold", step > 1 ? "bg-accent text-white" : "border-2 border-accent text-accent")}>
                        {step > 1 ? <Check size={16} /> : 1}
                      </span>
                      <span className="font-semibold">Frequência e formato</span>
                      {step > 1 && <span className="ml-auto text-sm text-muted">{perWeek}x · {format}{perMonth ? ` · ${perMonth}/mês` : ""}</span>}
                    </button>
                    {step === 1 && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <p className="mb-2 text-[14px] font-semibold text-accent">1.1 Quantas vezes por semana</p>
                          <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                aria-pressed={perWeek === n}
                                onClick={() => {
                                  setPerWeek(n);
                                  if (!perMonth || Number(perMonth) === perWeek * 4) setPerMonth(String(n * 4));
                                }}
                                className={cx("min-h-12 min-w-14 rounded-xl border text-[16px] font-semibold", perWeek === n ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface")}
                              >
                                {n}x
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[14px] font-semibold text-accent">1.2 Formato</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(["grupo", "individual"] as const).map((f) => (
                              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={cx("min-h-12 rounded-xl border font-semibold capitalize", format === f ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface")}>
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[14px] font-semibold text-accent">1.3 Aulas por mês</p>
                          <Input inputMode="numeric" value={perMonth} onChange={(e) => setPerMonth(e.target.value.replace(/\D/g, ""))} placeholder={perWeek ? String(perWeek * 4) : "8"} />
                          <p className="mt-1 text-[13px] text-muted">Padrão = vezes por semana × 4. Mude se a conta da clínica for outra (ex.: 2x = 9).</p>
                        </div>
                        {dup && <p className="text-[14px] font-medium text-warn">Já existe um plano {perWeek}x {format}. Salvar aqui atualiza os valores dele.</p>}
                      </div>
                    )}
                  </section>
                  {/* Passo 2 */}
                  <section className={cx("rounded-2xl border bg-surface", step === 2 ? "border-accent p-4" : "border-line px-4 py-3 opacity-70")}>
                    <div className="flex items-center gap-3">
                      <span className={cx("grid size-8 place-items-center rounded-full text-[14px] font-semibold", step === 2 ? "border-2 border-accent text-accent" : "bg-hover text-muted")}>2</span>
                      <span className="font-semibold">Valor por ciclo</span>
                    </div>
                    {step === 2 && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <p className="mb-2 text-[14px] font-semibold text-accent">2.1 Mensal (base) · R$ por mês</p>
                          <Input inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0,00" />
                        </div>
                        <div>
                          <p className="mb-2 text-[14px] font-semibold text-accent">2.2 Trimestral · semestral · anual (opcional)</p>
                          <div className="grid grid-cols-3 gap-2">
                            {CYC.map((x) => {
                              const cents = parseMoney(cyc[x.c] ?? "");
                              return (
                                <div key={x.c} className="space-y-1">
                                  <span className="block text-[12px] font-semibold text-muted uppercase">{x.s} /mês</span>
                                  <Input inputMode="decimal" value={cyc[x.c] ?? ""} onChange={(e) => setCyc((o) => ({ ...o, [x.c]: e.target.value }))} placeholder="—" />
                                  <span className="block text-[12px] text-muted">{cents ? `total ${formatMoney(cents * x.c)}` : "não vende"}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const t = window.prompt(`Total do plano ${x.l.toLowerCase()} (R$):`);
                                      const tc = t ? parseMoney(t) : null;
                                      if (tc) setCyc((o) => ({ ...o, [x.c]: money(Math.round(tc / x.c)) }));
                                    }}
                                    className="text-[12px] font-semibold text-accent"
                                  >
                                    digitar o total
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[13px] text-muted">Valor por mês; o total do ciclo é cobrado adiantado. Vazio = não vende.</p>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
                <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-warn">{missing.length ? `Falta: ${missing.join(", ")}` : ""}</span>
                  <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
                    Cancelar
                  </button>
                  {step === 1 ? (
                    <button type="button" disabled={!perWeek} onClick={() => setStep(2)} className={buttonClass("primary", "lg")}>
                      Continuar
                    </button>
                  ) : (
                    <SubmitButton size="lg" pendingText="Criando…">
                      Criar plano
                    </SubmitButton>
                  )}
                </div>
              </ActionForm>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
