"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buttonClass, cx, Field, Input, Select } from "@/components/ui";
import { SHEETS } from "@/lib/accountant-sheets";
import { PAY_METHODS } from "@/lib/format";

/** Escolhas da Planilha do contador. Envia por GET para /exportar/contador, que devolve o .xlsx. */
export function AccountantForm({ month, pros }: { month: string; pros: { id: string; name: string }[] }) {
  const [modo, setModo] = useState<"mes" | "intervalo">("mes");
  return (
    <form action="/exportar/contador" method="get" className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Período</legend>
        <input type="hidden" name="modo" value={modo} />
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { k: "mes", l: "Mês fechado" },
              { k: "intervalo", l: "Intervalo de datas" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              aria-pressed={modo === o.k}
              onClick={() => setModo(o.k)}
              className={cx("h-11 rounded-xl border text-[15px] font-medium", modo === o.k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted")}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {modo === "mes" ? (
            <Input type="month" name="mes" defaultValue={month} aria-label="Mês" required />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="De">
                <Input type="date" name="de" required />
              </Field>
              <Field label="Até">
                <Input type="date" name="ate" required />
              </Field>
            </div>
          )}
        </div>
      </fieldset>

      <Field label="Profissional" hint="Para quem tem contabilidade separada: entram só os lançamentos ligados ao profissional. Despesas gerais da clínica ficam de fora.">
        <Select name="pro" defaultValue="">
          <option value="">Todos — a clínica inteira</option>
          {pros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">O que vai no arquivo</legend>
        <div className="space-y-2">
          {SHEETS.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 has-checked:border-accent/50 has-checked:bg-accent-soft/40">
              <input type="checkbox" name="aba" value={s.key} defaultChecked className="mt-0.5 size-5 accent-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="text-sm text-muted">{s.text}</span>
              </span>
            </label>
          ))}
          <p className="text-[13px] text-muted">A primeira aba é sempre um resumo com os totais do período.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Forma de pagamento</legend>
        <div className="flex flex-wrap gap-2">
          {[...PAY_METHODS, { value: "nao_informada", label: "Não informada" }].map((m) => (
            <label key={m.value} className="cursor-pointer">
              <input type="checkbox" name="forma" value={m.value} className="peer sr-only" />
              <span className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-muted peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft">
                {m.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Nenhuma marcada = todas as formas entram.</p>
      </fieldset>

      <button className={buttonClass("primary", "lg")}>
        <Download size={18} /> Baixar planilha (.xlsx)
      </button>
    </form>
  );
}
