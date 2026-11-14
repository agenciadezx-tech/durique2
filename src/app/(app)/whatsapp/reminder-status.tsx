"use client";

import { useOptimistic, useTransition } from "react";
import { setAttendeeStatus } from "@/app/(app)/agenda/actions";
import { cx } from "@/components/ui";

/** Depois que o paciente responde: Confirmou / Desmarcou. */
export function ReminderStatus({ attendeeId, appointmentId, status }: { attendeeId: string; appointmentId: string; status: string }) {
  const [current, setCurrent] = useOptimistic(status);
  const [, start] = useTransition();
  const set = (next: string) => {
    const value = current === next || (next === "desmarcou" && current.startsWith("desmarcado")) ? "agendado" : next;
    const fd = new FormData();
    fd.set("id", attendeeId);
    fd.set("appointment_id", appointmentId);
    fd.set("status", value);
    start(async () => {
      setCurrent(value === "desmarcou" ? "desmarcado_no_prazo" : value);
      await setAttendeeStatus(fd);
    });
  };
  const confirmed = current === "confirmado";
  const canceled = current.startsWith("desmarcado");
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-pressed={confirmed}
        onClick={() => set("confirmado")}
        className={cx(
          "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
          confirmed ? "border-info bg-info text-white" : "border-line bg-surface hover:bg-hover",
        )}
      >
        Confirmou
      </button>
      <button
        type="button"
        aria-pressed={canceled}
        onClick={() => set("desmarcou")}
        className={cx(
          "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
          canceled ? "border-warn bg-warn text-white" : "border-line bg-surface hover:bg-hover",
        )}
      >
        Desmarcou
      </button>
    </div>
  );
}
