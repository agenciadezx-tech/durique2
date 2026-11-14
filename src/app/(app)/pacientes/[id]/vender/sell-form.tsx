"use client";

import { useState } from "react";
import { Package, Repeat } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PaidNowFields } from "@/components/finance";
import { cx, Field, Input, Select } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/format";
import { sellPackage } from "../../actions";

type Product = {
  id: string;
  name: string;
  kind: string;
  price_cents: number;
  sessions: number | null;
  validity_days: number | null;
  sessions_per_week: number | null;
};

export function SellForm({ patientId, products, today }: { patientId: string; products: Product[]; today: string }) {
  const [id, setId] = useState(products[0]?.id ?? "");
  const p = products.find((x) => x.id === id);
  const [price, setPrice] = useState(p ? (p.price_cents / 100).toFixed(2).replace(".", ",") : "");
  const [n, setN] = useState(1);
  const cents = parseMoney(price) ?? 0;

  return (
    <ActionForm action={sellPackage}>
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="product_id" value={id} />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">O que o paciente está comprando?</legend>
        {products.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              setId(x.id);
              setPrice((x.price_cents / 100).toFixed(2).replace(".", ","));
              setN(1);
            }}
            aria-pressed={id === x.id}
            className={cx(
              "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              id === x.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent">
              {x.kind === "plano" ? <Repeat size={18} /> : <Package size={18} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{x.name}</span>
              <span className="text-sm text-muted">
                {x.kind === "plano"
                  ? `${x.sessions_per_week}x por semana · cobrado todo mês`
                  : `${x.sessions} sessões${x.validity_days ? ` · válido por ${x.validity_days} dias` : ""}`}
              </span>
            </span>
            <span className="font-semibold tabular-nums">
              {formatMoney(x.price_cents)}
              {x.kind === "plano" && <span className="text-sm font-normal text-muted">/mês</span>}
            </span>
          </button>
        ))}
      </fieldset>

      {p && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label={p.kind === "plano" ? "Mensalidade (R$)" : "Valor total (R$)"} hint="Pode dar desconto aqui.">
              <Input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </Field>
            <Field label="Começa em">
              <Input name="starts_on" type="date" defaultValue={today} required />
            </Field>
            {p.kind === "pacote" && (
              <Field label="Parcelas">
                <Select name="installments" value={n} onChange={(e) => setN(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((k) => (
                    <option key={k} value={k}>
                      {k === 1 ? "À vista" : `${k}x de ${formatMoney(Math.floor(cents / k))}`}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={p.kind === "plano" ? "Vencimento da 1ª mensalidade" : n > 1 ? "Vencimento da 1ª parcela" : "Vencimento"}>
              <Input name="first_due" type="date" defaultValue={today} required />
            </Field>
          </div>
          <PaidNowFields label={p.kind === "plano" ? "1ª mensalidade já foi paga" : n > 1 ? "1ª parcela já foi paga" : "Já foi pago"} />
          <p className="text-[15px] text-muted">
            {p.kind === "plano"
              ? `Vamos lançar ${formatMoney(cents)} todo mês em Contas a receber, até o plano ser encerrado.`
              : n > 1
                ? `Vamos lançar ${n} parcelas mensais em Contas a receber.`
                : "Vamos lançar o valor em Contas a receber (ou como recebido, se já foi pago)."}
          </p>
          <SubmitButton full pendingText="Registrando venda…">
            Confirmar venda
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
