"use client";

import { useState } from "react";
import { cx, Field, Input, Select } from "@/components/ui";
import { PRO_COLORS } from "@/lib/colors";

type Product = {
  name: string;
  kind: string;
  price_cents: number;
  service_id: string | null;
  sessions: number | null;
  validity_days: number | null;
  sessions_per_week: number | null;
};

const money = (c?: number | null) => (c != null ? (c / 100).toFixed(2).replace(".", ",") : "");

export function ProductFields({ p, services, defaultServiceId }: { p?: Product; services: { id: string; name: string }[]; defaultServiceId?: string }) {
  const [kind, setKind] = useState(p?.kind ?? "pacote");
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {[
          { v: "pacote", t: "Pacote de sessões", d: "Ex.: 10 sessões" },
          { v: "plano", t: "Plano mensal", d: "Ex.: pilates 2x/semana" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={kind === o.v}
            onClick={() => setKind(o.v)}
            className={cx(
              "rounded-xl border p-3 text-left transition-colors",
              kind === o.v ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
            )}
          >
            <span className="block font-medium">{o.t}</span>
            <span className="text-sm text-muted">{o.d}</span>
          </button>
        ))}
      </div>
      <Field label="Nome">
        <Input name="name" required defaultValue={p?.name} placeholder={kind === "plano" ? "Ex.: Pilates 2x por semana" : "Ex.: Pacote 10 sessões de fisioterapia"} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {kind === "pacote" ? (
          <>
            <Field label="Nº de sessões">
              <Input name="sessions" type="number" min={1} max={500} required defaultValue={p?.sessions ?? 10} />
            </Field>
            <Field label="Validade (dias)" hint="Vazio = sem validade">
              <Input name="validity_days" type="number" min={1} max={1095} defaultValue={p?.validity_days ?? 60} />
            </Field>
            <Field label="Valor total (R$)">
              <Input name="price" inputMode="decimal" required placeholder="1.200,00" defaultValue={money(p?.price_cents)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Vezes por semana">
              <Input name="sessions_per_week" type="number" min={1} max={14} required defaultValue={p?.sessions_per_week ?? 2} />
            </Field>
            <Field label="Mensalidade (R$)">
              <Input name="price" inputMode="decimal" required placeholder="350,00" defaultValue={money(p?.price_cents)} />
            </Field>
          </>
        )}
        <Field label="Vale para">
          <Select name="service_id" defaultValue={p?.service_id ?? defaultServiceId ?? ""}>
            <option value="">Qualquer serviço</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}

export function CommissionFields({ percent, fixedCents }: { percent?: number | null; fixedCents?: number | null }) {
  const initial = percent != null ? "percent" : fixedCents != null ? "fixed" : "none";
  const [kind, setKind] = useState(initial);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Comissão / repasse">
        <Select name="commission_kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="none">Não recebe</option>
          <option value="percent">% por sessão</option>
          <option value="fixed">Valor fixo por sessão</option>
        </Select>
      </Field>
      {kind !== "none" && (
        <Field label={kind === "percent" ? "Percentual (%)" : "Valor por sessão (R$)"}>
          <Input
            key={kind}
            name="commission_value"
            inputMode="decimal"
            required
            defaultValue={kind === "percent" ? (percent ?? "").toString() : money(fixedCents)}
            placeholder={kind === "percent" ? "40" : "50,00"}
          />
        </Field>
      )}
    </div>
  );
}

export function ColorField({ value, legend = "Cor na agenda" }: { value?: string | null; legend?: string }) {
  const [c, setC] = useState(value ?? "");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <input type="hidden" name="color" value={c} />
      <div className="flex flex-wrap gap-2">
        {PRO_COLORS.map((p) => (
          <button
            key={p.hex}
            type="button"
            aria-label={p.name}
            aria-pressed={c === p.hex}
            onClick={() => setC(p.hex)}
            className={cx("size-9 rounded-full ring-offset-2 transition", c === p.hex ? "ring-2 ring-ink" : "hover:scale-110")}
            style={{ background: p.hex }}
          />
        ))}
      </div>
    </fieldset>
  );
}
