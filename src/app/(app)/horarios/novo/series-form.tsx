"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { cx, Field, Input, Select } from "@/components/ui";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { createSeries } from "../actions";

type Service = { id: string; name: string; kind: string; duration_min: number; default_capacity: number };
type Pro = { id: string; name: string };

export function SeriesForm({ services, pros, today }: { services: Service[]; pros: Pro[]; today: string }) {
  const [serviceId, setServiceId] = useState(services.find((s) => s.kind === "turma")?.id ?? services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId);
  const [days, setDays] = useState<number[]>([]);

  return (
    <ActionForm action={createSeries}>
      <Field label="Serviço">
        <Select name="service_id" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.kind === "turma" ? "(turma)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Profissional">
        <Select name="professional_id" defaultValue={pros.length === 1 ? pros[0].id : ""} required>
          {pros.length !== 1 && <option value="">Escolha…</option>}
          {pros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dias da semana</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = days.includes(d);
            return (
              <label
                key={d}
                className={cx(
                  "flex h-12 cursor-pointer items-center justify-center rounded-xl border text-[15px] font-medium capitalize transition-colors",
                  on ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink hover:bg-hover",
                )}
              >
                <input
                  type="checkbox"
                  name="weekday"
                  value={d}
                  className="sr-only"
                  checked={on}
                  onChange={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                />
                {WEEKDAYS_SHORT[d]}
              </label>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">Pode marcar mais de um. Ex.: terça e quinta.</p>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Horário">
          <Input name="start_time" type="time" required defaultValue="07:00" step={300} />
        </Field>
        <Field label="Duração (min)">
          <Input key={service?.id} name="duration_min" type="number" min={5} max={480} step={5} defaultValue={service?.duration_min ?? 50} />
        </Field>
        {service?.kind === "turma" && (
          <Field label="Vagas">
            <Input key={service.id} name="capacity" type="number" min={1} max={50} defaultValue={service.default_capacity} />
          </Field>
        )}
        <Field label="Começa em">
          <Input name="starts_on" type="date" defaultValue={today} min={today} />
        </Field>
      </div>

      <SubmitButton full pendingText="Criando e lançando na agenda…">
        Criar horário fixo
      </SubmitButton>
    </ActionForm>
  );
}
