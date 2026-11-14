"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PenLine } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/forms";
import { buttonClass, cx, Field, Input, Textarea } from "@/components/ui";
import { ASSESSMENT_FIELDS, EVOLUTION_FIELDS, PAIN_REGIONS } from "@/lib/clinical";

type Values = Record<string, string | number | string[] | null | undefined>;

function PainScale({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Dor agora (0 a 10)</legend>
      <input type="hidden" name="dor_eva" value={value ?? ""} />
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const on = value === n;
          const tone = n <= 3 ? "ok" : n <= 6 ? "warn" : "bad";
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : n)}
              className={cx(
                "h-11 rounded-lg border text-[15px] font-semibold tabular-nums transition-colors",
                !on && "border-line bg-surface hover:bg-hover",
                on && tone === "ok" && "border-ok bg-ok text-white",
                on && tone === "warn" && "border-warn bg-warn text-white",
                on && tone === "bad" && "border-bad bg-bad text-white",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[12px] text-muted">
        <span>Sem dor</span>
        <span>Pior dor possível</span>
      </div>
    </fieldset>
  );
}

function PainMap({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Onde dói?</legend>
      <div className="flex flex-wrap gap-1.5">
        {PAIN_REGIONS.map((r) => {
          const on = value.includes(r);
          return (
            <label
              key={r}
              className={cx(
                "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors select-none",
                on ? "border-bad bg-bad-soft font-medium text-bad" : "border-line bg-surface hover:bg-hover",
              )}
            >
              <input
                type="checkbox"
                name="mapa_dor"
                value={r}
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
                className="sr-only"
              />
              {r}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Buttons({ canSign }: { canSign: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="submit" name="sign" value="0" disabled={pending} className={buttonClass("secondary", "lg")}>
        {pending ? "Salvando…" : "Salvar rascunho"}
      </button>
      {canSign && (
        <button type="submit" name="sign" value="1" disabled={pending} className={cx(buttonClass("primary", "lg"), "sm:flex-1")}>
          <PenLine size={18} /> Salvar e assinar
        </button>
      )}
    </div>
  );
}

export function RecordForm({
  action,
  kind,
  patientId,
  attendeeId,
  recordId,
  initial = {},
  today,
  canSign = true,
}: {
  action: FormAction;
  kind: "avaliacao" | "evolucao";
  patientId: string;
  attendeeId?: string;
  recordId?: string;
  initial?: Values;
  today: string;
  canSign?: boolean;
}) {
  const [eva, setEva] = useState<number | null>(initial.dor_eva != null ? Number(initial.dor_eva) : null);
  const [regions, setRegions] = useState<string[]>(Array.isArray(initial.mapa_dor) ? (initial.mapa_dor as string[]) : []);
  const fields = kind === "avaliacao" ? ASSESSMENT_FIELDS : EVOLUTION_FIELDS;

  return (
    <ActionForm action={action}>
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="kind" value={kind} />
      {attendeeId && <input type="hidden" name="attendee_id" value={attendeeId} />}
      {recordId && <input type="hidden" name="id" value={recordId} />}
      <Field label="Data">
        <Input name="record_date" type="date" defaultValue={String(initial.record_date ?? today)} className="max-w-48" />
      </Field>
      <PainScale value={eva} onChange={setEva} />
      {kind === "avaliacao" && <PainMap value={regions} onChange={setRegions} />}
      {fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint || undefined}>
          <Textarea name={f.key} rows={f.rows} defaultValue={String(initial[f.key] ?? "")} />
        </Field>
      ))}
      {kind === "evolucao" && <PainMap value={regions} onChange={setRegions} />}
      <p className="text-[13px] text-muted">
        Depois de assinado, o registro não pode mais ser alterado (exigência do COFFITO). Correções são feitas por adendo.
      </p>
      <Buttons canSign={canSign} />
    </ActionForm>
  );
}
