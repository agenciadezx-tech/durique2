"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { BodyMap } from "@/components/body-map";
import { Alert, buttonClass, Card, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { PRE_GROUPS, type PreConfig } from "@/lib/pre-assessment";
import { submitPre } from "./actions";

type Answers = Record<string, string | number | string[] | null>;

export function PreForm({ token, cfg }: { token: string; cfg: PreConfig }) {
  const [a, setA] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string, v: Answers[string]) => setA((x) => ({ ...x, [k]: v }));
  const groups = PRE_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => cfg.fields[f.key]?.ask) })).filter((g) => g.fields.length);
  const empty = (v: Answers[string] | undefined) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

  if (done) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 size={48} className="mx-auto text-ok" />
        <h2 className="mt-3 text-[20px] font-semibold">Obrigado!</h2>
        <p className="mt-1 text-[15px] text-muted">Suas respostas foram enviadas. Isso adianta sua primeira consulta.</p>
      </Card>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const missing = [
          ...groups.flatMap((g) => g.fields).filter((f) => cfg.fields[f.key]?.req && empty(a[f.key])).map((f) => f.label),
          ...cfg.questions.filter((q) => q.req && empty(a[q.id])).map((q) => q.label),
        ];
        if (missing.length) {
          setError(`Responda: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        setError(null);
        start(async () => {
          const r = await submitPre(token, a);
          if (r.error) setError(r.error);
          else setDone(true);
        });
      }}
    >
      {error && <Alert>{error}</Alert>}
      {groups.map((g) => (
        <Card key={g.key} className="space-y-4 p-5">
          <h2 className="text-[17px] font-semibold">{g.title}</h2>
          {g.fields.map((f) => {
            const req = cfg.fields[f.key]?.req;
            const label = `${f.label}${req ? " *" : ""}`;
            if (f.type === "scale") {
              return (
                <fieldset key={f.key} className="space-y-2">
                  <legend className="text-sm font-medium">{label}</legend>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={a[f.key] === n}
                        onClick={() => set(f.key, n)}
                        className={cx(
                          "h-11 rounded-xl border font-semibold tabular-nums",
                          a[f.key] === n ? "border-accent bg-accent text-white" : "border-line bg-surface",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (f.type === "regions") {
              const v = (a[f.key] as string[] | undefined) ?? [];
              return (
                <fieldset key={f.key} className="space-y-2">
                  <legend className="text-sm font-medium">{label} — toque no boneco</legend>
                  <BodyMap value={v} onToggle={(r) => set(f.key, v.includes(r) ? v.filter((x) => x !== r) : [...v, r])} />
                  {v.length > 0 && <p className="text-sm text-muted">{v.join(", ")}</p>}
                </fieldset>
              );
            }
            if (f.type === "choice") {
              return (
                <Field key={f.key} label={label}>
                  <Select value={(a[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">Escolha…</option>
                    {f.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
              );
            }
            if (f.type === "textarea") {
              return (
                <Field key={f.key} label={label}>
                  <Textarea rows={3} maxLength={1500} value={(a[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                </Field>
              );
            }
            return (
              <Field key={f.key} label={label}>
                <Input
                  type={f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                  inputMode={f.key === "cpf" || f.key === "cep" ? "numeric" : undefined}
                  maxLength={300}
                  placeholder={f.placeholder}
                  value={(a[f.key] as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            );
          })}
        </Card>
      ))}
      {cfg.questions.length > 0 && (
        <Card className="space-y-4 p-5">
          <h2 className="text-[17px] font-semibold">Mais algumas perguntas</h2>
          {cfg.questions.map((q) => (
            <Field key={q.id} label={`${q.label}${q.req ? " *" : ""}`}>
              <Textarea rows={2} maxLength={1000} value={(a[q.id] as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
            </Field>
          ))}
        </Card>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", true)}>
        {pending ? "Enviando…" : "Enviar respostas"}
      </button>
      <p className="text-center text-[13px] text-faint">Suas respostas ficam só com a equipe de saúde da clínica.</p>
    </form>
  );
}
