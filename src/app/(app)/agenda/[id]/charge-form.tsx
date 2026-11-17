"use client";

import { useActionState, useState } from "react";
import { Check, Receipt } from "lucide-react";
import { chargeAttendee } from "@/app/(app)/(mais)/financeiro/actions";
import { PaidNowFields } from "@/components/finance";
import { buttonClass, cx, Input } from "@/components/ui";

export function ChargeForm({
  attendeeId,
  appointmentId,
  patientId,
  description,
  defaultCents,
  dueDate,
}: {
  attendeeId: string;
  appointmentId: string;
  patientId: string;
  description: string;
  defaultCents: number | null;
  dueDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(chargeAttendee, {});

  if (state.ok) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ok">
        <Check size={16} /> {state.ok}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass("ghost", "sm"), "mt-2 -ml-3 text-accent")}>
        <Receipt size={16} /> Cobrar sessão avulsa
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <input type="hidden" name="attendee_id" value={attendeeId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="due_date" value={dueDate} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Valor da sessão (R$)</span>
        <Input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={defaultCents != null ? (defaultCents / 100).toFixed(2).replace(".", ",") : ""}
          placeholder="150,00"
        />
      </label>
      <PaidNowFields defaultPaid label="Paciente já pagou" />
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Salvando…" : "Lançar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "md")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
