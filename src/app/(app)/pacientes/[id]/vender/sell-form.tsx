"use client";

import { useState } from "react";
import { Check, Gift, Package, Repeat, Ticket } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PaidNowFields } from "@/components/finance";
import { buttonClass, cx, Field, Input, Select } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/format";
import { bookSingleClass, sellPackage } from "../../actions";

type Product = {
  id: string;
  name: string;
  kind: string;
  price_cents: number;
  sessions: number | null;
  validity_days: number | null;
  sessions_per_week: number | null;
};
export type SeriesOption = { id: string; label: string; sub: string; free: number };
export type ClassOption = { id: string; day: string; dayLabel: string; time: string; sub: string; free: number; price_cents: number };
type Single = "experimental" | "avulsa";

const STEPS = ["Quem", "O quê", "Quando", "Quanto e como paga", "Pronto"] as const;
const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Venda de pacote / matrícula em passos: Quem (já vem da ficha) → O quê → Quando → Quanto e como paga → Pronto.
 * Todos os campos ficam no mesmo formulário; os passos só mostram/escondem.
 */
export function SellForm({
  patientId,
  patientName,
  products,
  today,
  series = [],
  classes = [],
  initialSingle = null,
  initialClass,
}: {
  patientId: string;
  patientName: string;
  products: Product[];
  today: string;
  series?: SeriesOption[];
  classes?: ClassOption[];
  initialSingle?: Single | null;
  initialClass?: string;
}) {
  const [step, setStep] = useState(2);
  const [single, setSingle] = useState<Single | null>(initialSingle);
  const [cls, setCls] = useState(initialClass ?? "");
  const [free, setFree] = useState(true); // experimental grátis
  const [id, setId] = useState(!initialSingle && products.length === 1 ? products[0].id : "");
  const p = products.find((x) => x.id === id);
  const [price, setPrice] = useState(p ? (p.price_cents / 100).toFixed(2).replace(".", ",") : "");
  const [n, setN] = useState(1);
  const [startsOn, setStartsOn] = useState(today);
  const [firstDue, setFirstDue] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  const cents = parseMoney(price) ?? 0;
  const plano = p?.kind === "plano";
  const groups = [
    { kind: "pacote", title: "Consultas · pacote de sessões", items: products.filter((x) => x.kind !== "plano") },
    { kind: "plano", title: "Aulas · plano mensal", items: products.filter((x) => x.kind === "plano") },
  ].filter((g) => g.items.length);

  const c = classes.find((x) => x.id === cls);
  const chargeCents = single === "experimental" && free ? 0 : cents;
  const canNext =
    step === 2 ? !!p || !!single : step === 3 ? (single ? !!c : true) : step === 4 ? (single === "experimental" ? free || cents > 0 : cents > 0) : true;
  const singleLabel = single === "experimental" ? "Aula experimental" : "Aula avulsa";
  const summary: Record<number, string> = single
    ? {
        1: patientName,
        2: singleLabel,
        3: c ? `${c.dayLabel} · ${c.time}` : "",
        4: chargeCents ? formatMoney(chargeCents) : "Grátis",
      }
    : {
        1: patientName,
        2: p ? `${p.name} · ${formatMoney(p.price_cents)}${plano ? "/mês" : ""}` : "",
        3: `começa ${br(startsOn)}${picked.length ? ` · ${picked.length} horário${picked.length === 1 ? "" : "s"}` : ""}`,
        4: `${formatMoney(cents)}${plano ? "/mês" : n > 1 ? ` em ${n}x` : " à vista"} · vence ${br(firstDue)}`,
      };
  const days = [...new Set(classes.map((x) => x.day))];
  function chooseSingle(k: Single) {
    setSingle(k);
    setId("");
    setPicked([]);
    setN(1);
    if (k === "avulsa" && c) setPrice((c.price_cents / 100).toFixed(2).replace(".", ","));
    if (k === "experimental") setPrice("");
  }

  return (
    <ActionForm action={single ? bookSingleClass : sellPackage} className="space-y-0!">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="product_id" value={id} />
      {single && <input type="hidden" name="charge_kind" value={single} />}
      {single && <input type="hidden" name="appointment_id" value={cls} />}
      {picked.map((s) => (
        <input key={s} type="hidden" name="series_id" value={s} />
      ))}

      {/* Progresso */}
      <div className="mb-4">
        <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
          Passo {step} de 5 <span className="font-medium tracking-normal text-accent normal-case">· quem já veio preenchido</span>
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={cx("h-1.5 rounded-full", i + 1 < step ? "bg-accent" : i + 1 === step ? "bg-accent/50" : "bg-line")} />
          ))}
        </div>
      </div>

      <ol className="space-y-2.5">
        {STEPS.map((title, i) => {
          const k = i + 1;
          const done = k < step;
          const current = k === step;
          return (
            <li key={title} className={cx("rounded-2xl border bg-surface", current ? "border-accent p-4 shadow-sm" : "border-line px-4 py-3", !done && !current && "opacity-60")}>
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    "grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold",
                    done ? "bg-accent text-white" : current ? "border-2 border-accent text-accent" : "bg-hover text-muted",
                  )}
                >
                  {done ? <Check size={16} /> : k}
                </span>
                <span className="font-semibold">{title}</span>
                {k === 1 && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">da ficha</span>}
                {done && <span className="min-w-0 flex-1 truncate text-right text-sm text-muted">{summary[k]}</span>}
                {done && k > 1 && (
                  <button type="button" onClick={() => setStep(k)} className="shrink-0 text-sm font-semibold text-accent">
                    alterar
                  </button>
                )}
              </div>

              {/* 2. O quê */}
              <div hidden={!(current && k === 2)} className="mt-4 space-y-4">
                {groups.map((g) => (
                  <div key={g.kind}>
                    <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.title}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          aria-pressed={id === x.id}
                          onClick={() => {
                            setId(x.id);
                            setSingle(null);
                            setPrice((x.price_cents / 100).toFixed(2).replace(".", ","));
                            setN(1);
                            if (x.kind !== "plano") setPicked([]);
                          }}
                          className={cx(
                            "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors",
                            id === x.id ? "border-accent bg-accent text-white" : "border-line bg-surface hover:bg-hover",
                          )}
                        >
                          {x.kind === "plano" ? <Repeat size={16} /> : <Package size={16} />}
                          {x.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {classes.length > 0 && (
                  <div>
                    <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Uma aula só</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          { k: "experimental", icon: Gift, t: "Aula experimental", d: "1ª aula de quem vem conhecer", v: "grátis ou valor" },
                          { k: "avulsa", icon: Ticket, t: "Aula avulsa", d: "Só nesta data, paga à parte", v: "valor da aula" },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.k}
                          type="button"
                          aria-pressed={single === o.k}
                          onClick={() => chooseSingle(o.k)}
                          className={cx(
                            "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                            single === o.k ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
                          )}
                        >
                          <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", single === o.k ? "bg-accent text-white" : "bg-accent-soft text-accent")}>
                            <o.icon size={19} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{o.t}</span>
                            <span className="block text-[13px] text-muted">{o.d}</span>
                          </span>
                          <span className="shrink-0 text-[13px] font-semibold text-accent">{o.v}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {single === "experimental" && (
                  <p className="rounded-xl bg-ok-soft px-3 py-2 text-[14px] text-ok">
                    Não desconta de pacote nem de plano. Se a clínica cobra a experimental, dá para pôr o valor no passo 4.
                  </p>
                )}
                {p && (
                  <p className="rounded-xl bg-accent-soft/50 px-3 py-2 text-[14px]">
                    <strong>{formatMoney(p.price_cents)}</strong>
                    {plano
                      ? ` por mês · ${p.sessions_per_week}x por semana`
                      : ` · ${p.sessions} sessões${p.validity_days ? ` · vale ${p.validity_days} dias` : ""}`}
                  </p>
                )}
              </div>

              {/* 3. Quando */}
              <div hidden={!(current && k === 3)} className="mt-4 space-y-4">
                {single && (
                  <div className="space-y-3">
                    <p className="text-[14px] font-semibold text-accent">Escolha a aula (próximas 2 semanas, com vaga)</p>
                    {days.map((d) => (
                      <div key={d}>
                        <p className="mb-1.5 text-[13px] font-semibold text-muted capitalize">{classes.find((x) => x.day === d)?.dayLabel}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {classes
                            .filter((x) => x.day === d)
                            .map((x) => (
                              <button
                                key={x.id}
                                type="button"
                                aria-pressed={cls === x.id}
                                onClick={() => {
                                  setCls(x.id);
                                  if (single === "avulsa") setPrice((x.price_cents / 100).toFixed(2).replace(".", ","));
                                }}
                                className={cx(
                                  "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                                  cls === x.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
                                )}
                              >
                                <span className="w-12 font-semibold tabular-nums">{x.time}</span>
                                <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{x.sub}</span>
                                <span className="text-[12px] font-semibold text-ok">
                                  {x.free} vaga{x.free === 1 ? "" : "s"}
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div hidden={!!single} className="space-y-4">
                <Field label="Começa em">
                  <Input name="starts_on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
                </Field>
                {plano && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Horários fixos {p?.sessions_per_week ? `(escolha até ${p.sessions_per_week})` : ""}</p>
                    <p className="mb-2 text-[13px] text-muted">O aluno já entra nessas turmas. Dá para mudar depois em “Gerir”.</p>
                    {series.length === 0 ? (
                      <p className="rounded-xl bg-hover px-3 py-3 text-sm text-muted">Nenhuma turma com vaga. Crie em Turmas › Nova turma.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {series.map((s) => {
                          const on = picked.includes(s.id);
                          const full = s.free <= 0;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={full && !on}
                              aria-pressed={on}
                              onClick={() => setPicked((l) => (on ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                              className={cx(
                                "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50",
                                on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
                              )}
                            >
                              <span className={cx("grid size-6 shrink-0 place-items-center rounded-md border", on ? "border-accent bg-accent text-white" : "border-line")}>
                                {on && <Check size={14} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{s.label}</span>
                                <span className="block truncate text-[12px] text-muted">{s.sub}</span>
                              </span>
                              <span className={cx("text-[12px] font-semibold", full ? "text-warn" : "text-muted")}>{full ? "lotada" : `${s.free} vaga${s.free === 1 ? "" : "s"}`}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {p?.sessions_per_week && picked.length > p.sessions_per_week && (
                      <p className="mt-2 text-[13px] font-medium text-warn">O plano é {p.sessions_per_week}x por semana e você marcou {picked.length} horários.</p>
                    )}
                  </div>
                )}
                </div>
              </div>

              {/* 4. Quanto e como paga */}
              <div hidden={!(current && k === 4)} className="mt-4 space-y-4">
                {single ? (
                  <>
                    {single === "experimental" && (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { v: true, t: "Grátis" },
                          { v: false, t: "Com valor" },
                        ].map((o) => (
                          <button
                            key={o.t}
                            type="button"
                            aria-pressed={free === o.v}
                            onClick={() => setFree(o.v)}
                            className={cx(
                              "min-h-12 rounded-xl border text-[15px] font-semibold transition-colors",
                              free === o.v ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
                            )}
                          >
                            {o.t}
                          </button>
                        ))}
                      </div>
                    )}
                    {(single === "avulsa" || !free) && (
                      <>
                        <Field label="Valor da aula (R$)">
                          <Input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
                        </Field>
                        <PaidNowFields label="Já foi pago" />
                      </>
                    )}
                    {single === "experimental" && free && <p className="text-[14px] text-muted">Nada vai para Contas a receber. A aula não desconta de pacote.</p>}
                  </>
                ) : (
                <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={plano ? "Mensalidade (R$)" : "Valor total (R$)"} hint="Pode dar desconto aqui.">
                    <Input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
                  </Field>
                  {!plano ? (
                    <Field label="Parcelas">
                      <Select name="installments" value={n} onChange={(e) => setN(Number(e.target.value))}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((k2) => (
                          <option key={k2} value={k2}>
                            {k2 === 1 ? "À vista" : `${k2}x de ${formatMoney(Math.floor(cents / k2))}`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <span />
                  )}
                  <Field label={plano ? "Vence a 1ª mensalidade" : n > 1 ? "Vence a 1ª parcela" : "Vencimento"}>
                    <Input name="first_due" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} required />
                  </Field>
                </div>
                <PaidNowFields label={plano ? "1ª mensalidade já foi paga" : n > 1 ? "1ª parcela já foi paga" : "Já foi pago"} />
                </>
                )}
              </div>

              {/* 5. Pronto */}
              <div hidden={!(current && k === 5)} className="mt-4 space-y-3">
                <dl className="divide-y divide-line rounded-xl border border-line text-[15px]">
                  {(single
                    ? [
                        ["Aluno", patientName],
                        ["O quê", singleLabel],
                        ["Aula", c ? `${c.dayLabel} · ${c.time} · ${c.sub}` : "—"],
                        ["Valor", chargeCents ? formatMoney(chargeCents) : "Grátis"],
                      ]
                    : [
                    ["Paciente", patientName],
                    [plano ? "Plano" : "Pacote", p?.name ?? "—"],
                    ["Começa", br(startsOn)],
                    ...(plano ? [["Horários", picked.length ? series.filter((s) => picked.includes(s.id)).map((s) => s.label).join(" · ") : "escolher depois"]] : []),
                    ["Valor", `${formatMoney(cents)}${plano ? " por mês" : n > 1 ? ` em ${n}x de ${formatMoney(Math.floor(cents / n))}` : " à vista"}`],
                  ]).map(([a, b]) => (
                    <div key={a} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="text-muted">{a}</dt>
                      <dd className="text-right font-medium">{b}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[14px] text-muted">
                  {single
                    ? chargeCents
                      ? "O aluno entra na aula e o valor vai para Contas a receber (ou como recebido). Não desconta de pacote."
                      : "O aluno entra na aula com o selo Experimental. Não paga e não desconta de pacote."
                    : plano
                    ? "A mensalidade entra em Contas a receber todo mês, até o plano ser encerrado."
                    : n > 1
                      ? `Vamos lançar ${n} parcelas mensais em Contas a receber.`
                      : "O valor entra em Contas a receber (ou como recebido, se já foi pago)."}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Barra de baixo */}
      <div className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:px-7">
        <button type="button" disabled={step <= 2} onClick={() => setStep((s) => s - 1)} className={buttonClass("secondary", "lg")}>
          Voltar
        </button>
        {step < 5 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)} className={cx(buttonClass("primary", "lg"), "flex-1")}>
            Continuar
          </button>
        ) : (
          <div className="flex-1">
            <SubmitButton full pendingText="Registrando…">
              {single ? "Colocar na aula" : plano ? "Confirmar matrícula" : "Confirmar venda"}
            </SubmitButton>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
