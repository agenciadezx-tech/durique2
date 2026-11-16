import { Field, Input, Select } from "@/components/ui";

export function Disclosure({ summary, children, label = "Editar" }: { summary: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-hover [&::-webkit-details-marker]:hidden">
        {summary}
        <span className="ml-auto text-sm text-muted group-open:hidden">{label}</span>
        <span className="ml-auto hidden text-sm text-muted group-open:inline">Fechar</span>
      </summary>
      <div className="border-t border-line bg-bg/60 px-4 py-5">{children}</div>
    </details>
  );
}

export function ServiceFields({ s }: { s?: { name: string; kind: string; duration_min: number; default_capacity: number; price_cents: number | null } }) {
  return (
    <>
      <Field label="Nome" htmlFor={`sn-${s?.name ?? "novo"}`}>
        <Input id={`sn-${s?.name ?? "novo"}`} name="name" required defaultValue={s?.name} placeholder="Ex.: Pilates em turma" />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Tipo">
          <Select name="kind" defaultValue={s?.kind ?? "individual"}>
            <option value="individual">Individual</option>
            <option value="turma">Turma</option>
          </Select>
        </Field>
        <Field label="Duração (min)">
          <Input name="duration_min" type="number" min={5} max={480} step={5} required defaultValue={s?.duration_min ?? 50} />
        </Field>
        <Field label="Vagas (turma)">
          <Input name="default_capacity" type="number" min={1} max={50} defaultValue={s?.default_capacity ?? 4} />
        </Field>
        <Field label="Preço (R$)">
          <Input name="price" inputMode="decimal" placeholder="Opcional" defaultValue={s?.price_cents != null ? (s.price_cents / 100).toFixed(2).replace(".", ",") : ""} />
        </Field>
      </div>
    </>
  );
}

