"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, X } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { concludeAppointment } from "../actions";

type Person = { id: string; name: string; confirmed: boolean };

/**
 * Botão "Concluir aula": abre a lista de quem ainda não tem presença marcada.
 * Todos começam como "Veio" (inclusive quem não confirmou no app); o profissional só toca em quem faltou.
 */
export function ConcludeButton({ appointmentId, people, isClass }: { appointmentId: string; people: Person[]; isClass: boolean }) {
  const [open, setOpen] = useState(false);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const came = people.length - absent.size;
  const word = isClass ? "aula" : "atendimento";

  const toggle = (id: string) =>
    setAbsent((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "lg", true)}>
        <CheckCheck size={20} /> Concluir {word}
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="conclude-title">
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
            <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
                <div>
                  <h2 id="conclude-title" className="text-[18px] font-semibold">
                    Concluir {word}
                  </h2>
                  <p className="mt-0.5 text-[14px] text-muted">
                    {people.length > 1 ? "Todos ficam como Veio. Toque em quem faltou." : "Confirme se o paciente veio."}
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover">
                  <X size={20} />
                </button>
              </div>
              <ul className="flex-1 divide-y divide-line overflow-y-auto border-y border-line">
                {people.map((p) => {
                  const off = absent.has(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => toggle(p.id)} aria-pressed={!off} className="flex min-h-16 w-full items-center gap-3 px-5 py-2 text-left hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className={cx("block truncate font-medium", off && "text-muted line-through")}>{p.name}</span>
                          <span className="block text-[13px] text-muted">{p.confirmed ? "Confirmou no app" : "Não confirmou"}</span>
                        </span>
                        <span
                          className={cx(
                            "flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[15px] font-semibold transition-colors",
                            off ? "bg-bad-soft text-bad" : "bg-ok text-white",
                          )}
                        >
                          {off ? <X size={17} /> : <Check size={17} />} {off ? "Faltou" : "Veio"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && <p className="px-5 pt-3 text-sm font-medium text-bad">{error}</p>}
              <div className="flex gap-2 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await concludeAppointment(appointmentId, [...absent]);
                      if (r.error) setError(r.error);
                      else setOpen(false);
                    })
                  }
                  className={cx(buttonClass("primary", "lg"), "flex-1")}
                >
                  {pending ? "Salvando…" : people.length > 1 ? `Concluir · ${came} ${came === 1 ? "veio" : "vieram"}` : absent.size ? "Concluir · faltou" : "Concluir · veio"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
