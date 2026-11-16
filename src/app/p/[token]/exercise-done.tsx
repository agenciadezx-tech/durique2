"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { portalExercise } from "./actions";

export function ExerciseDone({ token, planId, doneToday }: { token: string; planId: string; doneToday: boolean }) {
  const [done, setDone] = useState(doneToday);
  const [pain, setPain] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (p: number | null) =>
    start(async () => {
      const r = await portalExercise(token, planId, p);
      if (r.error) setError(r.error);
      else {
        setDone(true);
        if (p != null) setPain(p);
      }
    });

  if (!done) {
    return (
      <div>
        <button type="button" disabled={pending} onClick={() => send(null)} className={buttonClass("primary", "lg", true)}>
          {pending ? "Registrando…" : "Fiz hoje"}
        </button>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-ok-soft p-4">
      <p className="flex items-center gap-2 font-medium text-ok">
        <CheckCircle2 size={20} /> Feito hoje!
      </p>
      <p className="mt-3 text-sm">{pain == null ? "Quanto doeu? (0 = nada, 10 = muito)" : `Dor informada: ${pain}/10. Obrigado!`}</p>
      {pain == null && (
        <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              disabled={pending}
              onClick={() => send(n)}
              className={cx(
                "h-11 rounded-xl border border-line bg-surface font-medium tabular-nums hover:border-accent",
                n >= 7 ? "text-bad" : n >= 4 ? "text-warn" : "text-ok",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
