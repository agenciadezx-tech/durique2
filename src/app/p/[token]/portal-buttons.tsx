"use client";

import { useState, useTransition } from "react";
import { buttonClass, cx } from "@/components/ui";
import { portalBook, portalCancel, portalConfirm, portalReschedule } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => start(async () => setRes(await fn()));
  return { pending, res, run };
}

export function SessionButtons({
  token,
  attendeeId,
  status,
  inTime,
  color,
  canCancel = true,
  options,
}: {
  token: string;
  attendeeId: string;
  status: string;
  inTime: boolean;
  color?: string;
  canCancel?: boolean;
  options?: { id: string; label: string; sub: string }[];
}) {
  const { pending, res, run } = useRun();
  const [moving, setMoving] = useState(false);
  if (res?.ok) return <p className="mt-3 text-sm font-medium text-ok">{res.ok}</p>;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
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
        {options && (
          <button type="button" disabled={pending} onClick={() => setMoving((m) => !m)} aria-expanded={moving} className={cx(buttonClass("secondary", "md"), "flex-1")}>
            Remarcar
          </button>
        )}
        {canCancel && (
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
        )}
      </div>
      {moving && options && (
        <div className="mt-3 space-y-2 rounded-2xl border border-line bg-bg p-3">
          <p className="text-[14px] font-semibold">Escolha o novo horário</p>
          {options.length === 0 ? (
            <p className="text-[14px] text-muted">Sem outro horário com vaga nos próximos dias. Fale com a clínica.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Trocar para ${o.label}?`)) run(() => portalReschedule(token, attendeeId, o.id));
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:border-accent"
              >
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-[13px] text-muted">{o.sub}</span>
                </span>
                <span className="text-[14px] font-semibold" style={color ? { color } : undefined}>
                  Trocar
                </span>
              </button>
            ))
          )}
        </div>
      )}
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
