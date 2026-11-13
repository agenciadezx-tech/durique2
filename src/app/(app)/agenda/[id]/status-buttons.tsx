"use client";

import { useOptimistic, useTransition } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { AttendeeBadge } from "@/components/status";
import { cx } from "@/components/ui";
import { setAttendeeStatus } from "../actions";

const BUTTONS = [
  { key: "presente", label: "Veio", icon: Check, on: "border-ok bg-ok text-white" },
  { key: "falta", label: "Faltou", icon: X, on: "border-bad bg-bad text-white" },
  { key: "desmarcou", label: "Desmarcou", icon: RotateCcw, on: "border-warn bg-warn text-white" },
] as const;

/** Badge + botões Veio/Faltou/Desmarcou com resposta instantânea (grava em segundo plano). */
export function AttendeeStatus({
  attendeeId,
  appointmentId,
  status,
  canEdit,
  extra,
  avatar,
  title,
  trailing,
}: {
  attendeeId: string;
  appointmentId: string;
  status: string;
  canEdit: boolean;
  extra?: React.ReactNode;
  avatar: React.ReactNode;
  title: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, start] = useTransition();
  const current = optimistic.startsWith("desmarcado") ? "desmarcou" : optimistic;

  function choose(key: string) {
    const next = current === key ? "agendado" : key;
    const fd = new FormData();
    fd.set("id", attendeeId);
    fd.set("appointment_id", appointmentId);
    fd.set("status", next);
    start(async () => {
      setOptimistic(next === "desmarcou" ? "desmarcado_no_prazo" : next);
      await setAttendeeStatus(fd);
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          {title}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <AttendeeBadge status={optimistic} />
            {pending && <span className="text-[13px] text-faint">salvando…</span>}
            {extra}
          </div>
        </div>
        {trailing}
      </div>
      {canEdit && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BUTTONS.map(({ key, label, icon: Icon, on }) => {
            const active = current === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => choose(key)}
                className={cx(
                  "flex h-11 items-center justify-center gap-1.5 rounded-xl border px-1 text-[14px] font-medium transition-colors sm:text-[15px]",
                  active ? on : "border-line bg-surface text-ink hover:bg-hover",
                )}
              >
                <Icon size={16} className="hidden min-[400px]:block" />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
