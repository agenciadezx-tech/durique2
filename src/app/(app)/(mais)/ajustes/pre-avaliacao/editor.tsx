"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, buttonClass, Card, cx, Input } from "@/components/ui";
import { PRE_GROUPS, type PreConfig } from "@/lib/pre-assessment";
import { savePreForm } from "./actions";

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40", on ? "bg-accent" : "bg-line")}
    >
      <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
    </button>
  );
}

export function PreFormEditor({ kind, initial, canEdit }: { kind: "consulta" | "aula"; initial: PreConfig; canEdit: boolean }) {
  const [cfg, setCfg] = useState<PreConfig>(initial);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (key: string, patch: Partial<{ ask: boolean; req: boolean }>) =>
    setCfg((c) => {
      const cur = c.fields[key] ?? { ask: false, req: false };
      const next = { ...cur, ...patch };
      if (!next.ask) next.req = false;
      return { ...c, fields: { ...c.fields, [key]: next } };
    });

  return (
    <div className="space-y-5">
      {PRE_GROUPS.map((g) => {
        const allOn = g.fields.every((f) => cfg.fields[f.key]?.ask);
        return (
          <Card key={g.key} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="font-semibold">{g.title}</p>
              {canEdit && (
                <button type="button" onClick={() => g.fields.forEach((f) => set(f.key, { ask: !allOn }))} className="text-sm font-medium text-accent hover:underline">
                  {allOn ? "Desligar todos" : "Ligar todos"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 pt-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <span />
              <span className="w-12 text-center">Pedir</span>
              <span className="w-12 text-center">Obrig.</span>
            </div>
            <ul className="divide-y divide-line">
              {g.fields.map((f) => {
                const c = cfg.fields[f.key] ?? { ask: false, req: false };
                return (
                  <li key={f.key} className="grid min-h-12 grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-1.5">
                    <span className={cx("text-[15px]", !c.ask && "text-muted")}>{f.label}</span>
                    <Switch on={c.ask} onChange={(v) => set(f.key, { ask: v })} label={`Pedir ${f.label}`} disabled={!canEdit} />
                    <Switch on={c.req} onChange={(v) => set(f.key, { req: v })} label={`${f.label} obrigatória`} disabled={!canEdit || !c.ask} />
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <Card className="p-4">
        <p className="font-semibold">Perguntas próprias ({cfg.questions.length}/10)</p>
        <p className="text-sm text-muted">Ex.: &quot;Já fez pilates antes?&quot;, &quot;Tem alguma restrição médica para exercícios?&quot;</p>
        <div className="mt-3 space-y-2">
          {cfg.questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2">
              <Input
                value={q.label}
                disabled={!canEdit}
                maxLength={200}
                onChange={(e) => setCfg((c) => ({ ...c, questions: c.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                placeholder="Escreva a pergunta"
                aria-label={`Pergunta ${i + 1}`}
              />
              <Switch
                on={q.req}
                disabled={!canEdit}
                label="Obrigatória"
                onChange={(v) => setCfg((c) => ({ ...c, questions: c.questions.map((x, j) => (j === i ? { ...x, req: v } : x)) }))}
              />
              {canEdit && (
                <button
                  type="button"
                  aria-label="Remover pergunta"
                  onClick={() => setCfg((c) => ({ ...c, questions: c.questions.filter((_, j) => j !== i) }))}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-hover hover:text-bad"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
          {canEdit && cfg.questions.length < 10 && (
            <button
              type="button"
              onClick={() => setCfg((c) => ({ ...c, questions: [...c.questions, { id: `q${Date.now()}`, label: "", req: false }] }))}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent"
            >
              <Plus size={16} /> Adicionar pergunta
            </button>
          )}
        </div>
      </Card>

      {res?.error && <Alert>{res.error}</Alert>}
      {res?.ok && <Alert tone="ok">{res.ok}</Alert>}
      {canEdit && (
        <button type="button" disabled={pending} onClick={() => start(async () => setRes(await savePreForm(kind, cfg)))} className={buttonClass("primary", "lg")}>
          {pending ? "Salvando…" : "Salvar formulário"}
        </button>
      )}
    </div>
  );
}
