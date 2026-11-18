"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";

/** Marca os serviços do Catálogo que a pessoa faz. Nenhum marcado = faz todos. */
export function ServicePicker({ services, chosen }: { services: { id: string; name: string; kind: string }[]; chosen: string[] }) {
  const [sel, setSel] = useState<string[]>(chosen);
  if (!services.length) return <p className="text-[15px] text-muted">Cadastre os serviços no Catálogo para escolher aqui.</p>;
  const groups = [
    { t: "Consultas", items: services.filter((s) => s.kind !== "turma"), dot: "bg-chart-in" },
    { t: "Aulas", items: services.filter((s) => s.kind === "turma"), dot: "bg-chart-out" },
  ].filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      {sel.map((s) => (
        <input key={s} type="hidden" name="service_id" value={s} />
      ))}
      {groups.map((g) => (
        <div key={g.t}>
          <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.t}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((s) => {
              const on = sel.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSel((l) => (on ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors",
                    on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
                  )}
                >
                  {on ? <Check size={16} /> : <span className={cx("size-2 rounded-full", g.dot)} />} {s.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className={cx("text-[14px]", sel.length ? "text-muted" : "font-medium text-warn")}>
        {sel.length
          ? "No link de agendamento e em Nova consulta, a pessoa só aparece nesses serviços."
          : "Nenhum marcado: a pessoa aparece em todos os serviços. Marque os que ela faz para o paciente escolher o profissional certo."}
      </p>
    </div>
  );
}
