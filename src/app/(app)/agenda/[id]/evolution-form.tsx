"use client";

import { useState, useTransition } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { Alert, buttonClass, Card, cx, Input, Textarea } from "@/components/ui";
import { LEVELS } from "@/lib/levels";
import { saveEvolution } from "./evolution-actions";

type Person = { patient_id: string; name: string; level: number | null; note: string };

function LevelPicker({ value, onChange, size = "md" }: { value: number | null; onChange: (v: number | null) => void; size?: "md" | "sm" }) {
  return (
    <div className={cx("grid gap-1.5", size === "md" ? "grid-cols-5" : "grid-cols-6")} role="radiogroup" aria-label="Nível">
      {size === "sm" && (
        <button
          type="button"
          role="radio"
          aria-checked={value == null}
          onClick={() => onChange(null)}
          className={cx("h-11 rounded-xl border text-[12px] font-medium", value == null ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted")}
        >
          Igual
        </button>
      )}
      {LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          title={l.label}
          onClick={() => onChange(value === l.value && size === "md" ? null : l.value)}
          className={cx(
            "flex h-11 flex-col items-center justify-center rounded-xl border leading-tight transition-colors",
            value === l.value ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent",
          )}
        >
          <span className="text-[15px] font-semibold tabular-nums">{l.value}</span>
          {size === "md" && <span className={cx("hidden text-[11px] sm:block", value === l.value ? "text-white/85" : "text-muted")}>{l.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function EvolutionForm({
  appointmentId,
  turma,
  initialLevel,
  initialNotes,
  people,
  savedAt,
}: {
  appointmentId: string;
  turma: boolean;
  initialLevel: number | null;
  initialNotes: string;
  people: Person[];
  savedAt: string | null;
}) {
  const [level, setLevel] = useState<number | null>(initialLevel);
  const [notes, setNotes] = useState(initialNotes);
  const [list, setList] = useState(people);
  const [open, setOpen] = useState(people.some((p) => p.level != null || p.note));
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const upd = (i: number, patch: Partial<Person>) => setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <TrendingUp size={20} />
        </span>
        <div>
          <p className="font-semibold">{turma ? "Como foi a turma hoje?" : "Como foi o atendimento?"}</p>
          <p className="text-sm text-muted">
            {turma ? "Avalie uma vez: vai para a ficha de cada aluno que veio." : "Vai para a ficha do paciente."}
            {savedAt && ` Salvo em ${savedAt}.`}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Nível {turma ? "da turma" : "do paciente"}</p>
        <LevelPicker value={level} onChange={setLevel} />
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        maxLength={2000}
        aria-label="O que foi trabalhado"
        placeholder={turma ? "O que foi trabalhado: ex.: core, mobilidade de quadril, Reformer com mola vermelha." : "Conduta, resposta do paciente, orientações."}
      />

      {turma && list.length > 0 && (
        <div className="rounded-xl border border-line">
          <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm font-medium">
            Ajustar algum aluno (opcional)
            <ChevronDown size={18} className={cx("transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ul className="divide-y divide-line border-t border-line">
              {list.map((p, i) => (
                <li key={p.patient_id} className="space-y-2 px-3 py-3">
                  <p className="font-medium">{p.name}</p>
                  <LevelPicker size="sm" value={p.level} onChange={(v) => upd(i, { level: v })} />
                  <Input value={p.note} onChange={(e) => upd(i, { note: e.target.value })} maxLength={1000} placeholder="Observação só deste aluno (opcional)" aria-label={`Observação de ${p.name}`} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {res?.error && <Alert>{res.error}</Alert>}
      {res?.ok && <Alert tone="ok">{res.ok}</Alert>}
      <button
        type="button"
        disabled={pending || (level == null && !notes.trim() && !list.some((p) => p.level != null || p.note.trim()))}
        onClick={() =>
          start(async () =>
            setRes(
              await saveEvolution({
                appointmentId,
                level,
                notes,
                individual: list.map((p) => ({ patient_id: p.patient_id, level: p.level, note: p.note })),
              }),
            ),
          )
        }
        className={buttonClass("primary", "md")}
      >
        {pending ? "Salvando…" : "Salvar evolução"}
      </button>
    </Card>
  );
}
