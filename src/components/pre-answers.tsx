import { ALL_FIELDS } from "@/lib/pre-assessment";

/** Mostra as respostas da pré-avaliação com os nomes das perguntas. */
export function PreAnswers({
  answers,
  questions = [],
}: {
  answers: Record<string, unknown>;
  questions?: { id: string; label: string }[];
}) {
  const rows = [
    ...ALL_FIELDS.filter((f) => answers[f.key] != null && answers[f.key] !== "" && !(Array.isArray(answers[f.key]) && (answers[f.key] as unknown[]).length === 0)).map((f) => ({
      label: f.label,
      value: Array.isArray(answers[f.key]) ? (answers[f.key] as string[]).join(", ") : f.type === "scale" ? `${answers[f.key]}/10` : String(answers[f.key]),
    })),
    ...questions.filter((q) => answers[q.id]).map((q) => ({ label: q.label, value: String(answers[q.id]) })),
  ];
  if (!rows.length) return <p className="text-sm text-muted">Sem respostas.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-[12px] font-semibold tracking-wide text-muted uppercase">{r.label}</dt>
          <dd className="text-[15px] whitespace-pre-wrap">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
