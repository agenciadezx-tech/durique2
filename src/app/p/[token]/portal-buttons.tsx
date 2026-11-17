"use client";

import { useState, useTransition } from "react";
import { buttonClass, cx } from "@/components/ui";
import { portalBook, portalCancel, portalConfirm } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => start(async () => setRes(await fn()));
  return { pending, res, run };
}

export function SessionButtons({ token, attendeeId, status, inTime, color }: { token: string; attendeeId: string; status: string; inTime: boolean; color?: string }) {
  const { pending, res, run } = useRun();
  if (res?.ok) return <p className="mt-3 text-sm font-medium text-ok">{res.ok}</p>;
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {status === "agendado" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => portalConfirm(token, attendeeId))}
            className={cx(buttonClass("primary", "md"), "flex-1")}
            style={color ? { background: color } : undefined}
          >
            Confirmar presença
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const q = inTime
              ? "Desmarcar? Você ganha um crédito para repor em outro horário."
              : "Desmarcar? Como falta pouco tempo, vai contar como sessão feita.";
            if (window.confirm(q)) run(() => portalCancel(token, attendeeId));
          }}
          className={cx(buttonClass("secondary", "md"), "flex-1")}
        >
          Não vou poder
        </button>
      </div>
      {res?.error && <p className="mt-2 text-sm text-bad">{res.error}</p>}
    </div>
  );
}

export function BookButton({ token, appointmentId }: { token: string; appointmentId: string }) {
  const { pending, res, run } = useRun();
  if (res?.ok) return <span className="text-sm font-medium text-ok">{res.ok}</span>;
  return (
    <span className="flex flex-col items-end">
      <button type="button" disabled={pending} onClick={() => run(() => portalBook(token, appointmentId))} className={buttonClass("primary", "sm")}>
        {pending ? "…" : "Repor aqui"}
      </button>
      {res?.error && <span className="mt-1 text-xs text-bad">{res.error}</span>}
    </span>
  );
}
