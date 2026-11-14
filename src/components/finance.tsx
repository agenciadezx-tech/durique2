"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { markPaid } from "@/app/(app)/financeiro/actions";
import { PAY_METHODS } from "@/lib/format";
import { buttonClass, cx, Select } from "./ui";

/** Botão "Receber"/"Pagar" que abre a escolha da forma de pagamento e dá baixa. */
export function PayButton({
  id,
  type,
  amountLabel,
  back,
  size = "sm",
}: {
  id: string;
  type: "receita" | "despesa";
  amountLabel: string;
  back?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markPaid, {});
  const verb = type === "receita" ? "Receber" : "Pagar";

  if (state.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-ok">
        <Check size={16} /> {type === "receita" ? "Recebido" : "Pago"}
      </span>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(type === "receita" ? "primary" : "secondary", size)}>
        {verb}
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input type="hidden" name="id" value={id} />
      {back && <input type="hidden" name="back" value={back} />}
      <Select name="payment_method" defaultValue="pix" className="h-10 min-w-40 flex-1 text-[15px]" aria-label="Forma de pagamento">
        {PAY_METHODS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <button disabled={pending} className={cx(buttonClass("primary", "sm"), "h-10")}>
        {pending ? "Salvando…" : `Confirmar ${amountLabel}`}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={cx(buttonClass("ghost", "sm"), "h-10")}>
        Voltar
      </button>
      {state.error && <p className="w-full text-sm text-bad">{state.error}</p>}
    </form>
  );
}

/** Campo "pago agora?" + forma de pagamento. */
export function PaidNowFields({ defaultPaid = false, label = "Já foi pago" }: { defaultPaid?: boolean; label?: string }) {
  const [paid, setPaid] = useState(defaultPaid);
  return (
    <div className="space-y-3 rounded-xl bg-bg p-4">
      <label className="flex items-center gap-2.5 text-[15px] font-medium">
        <input
          type="checkbox"
          name="paid_now"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="size-5 accent-[var(--color-accent)]"
        />
        {label}
      </label>
      {paid && (
        <Select name="payment_method" defaultValue="pix" aria-label="Forma de pagamento">
          {PAY_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
