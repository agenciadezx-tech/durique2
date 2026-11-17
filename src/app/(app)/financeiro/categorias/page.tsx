import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, Field, Input, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { saveCategory, toggleCategory } from "../actions";

export const metadata = { title: "Categorias" };

const COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#e11d48", "#d97a2b", "#ca8a04", "#059669", "#64748b"];

type Cat = { id: string; type: "receita" | "despesa"; name: string; system_key: string | null; active: boolean; color: string | null };

function ColorPick({ value, name }: { value: string | null; name: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Cor</legend>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <label key={c} className="relative grid size-11 cursor-pointer place-items-center">
            <input type="radio" name={name} value={c} defaultChecked={value === c} className="peer sr-only" />
            <span className="size-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ background: c }} />
            <span className="sr-only">{c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CatRow({ c }: { c: Cat }) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
        <span className="size-4 shrink-0 rounded-full" style={{ background: c.color ?? "var(--color-line)" }} />
        <span className={c.active ? "font-medium" : "font-medium text-muted line-through"}>{c.name}</span>
        {c.system_key && <Badge>automática</Badge>}
        {!c.active && <Badge>guardada</Badge>}
        <span className="ml-auto text-sm text-muted group-open:hidden">Editar</span>
        <span className="ml-auto hidden text-sm text-muted group-open:inline">Fechar</span>
      </summary>
      <div className="space-y-4 border-t border-line bg-bg/60 px-4 py-5">
        <ActionForm action={saveCategory}>
          <input type="hidden" name="id" value={c.id} />
          <Field label="Nome">
            <Input name="name" defaultValue={c.name} required maxLength={60} />
          </Field>
          <ColorPick name="color" value={c.color} />
          <SubmitButton size="md">Salvar</SubmitButton>
        </ActionForm>
        {!c.system_key && (
          <form action={toggleCategory}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={c.active ? "0" : "1"} />
            <button className={buttonClass("ghost", "sm")}>{c.active ? "Guardar (não aparece mais para escolher)" : "Voltar a usar"}</button>
          </form>
        )}
      </div>
    </details>
  );
}

export default async function CategoriasPage() {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, type, name, system_key, active, color").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name");
  const cats = (data ?? []) as Cat[];

  return (
    <>
      <PageHeader title="Categorias" description="Separe o que entra e o que sai. A cor ajuda a achar rápido nos lançamentos." back={{ href: "/financeiro/lancamentos", label: "Lançamentos" }} />
      <div className="grid gap-6 lg:grid-cols-2">
        {(["receita", "despesa"] as const).map((type) => (
          <Section key={type} title={type === "receita" ? "Entradas" : "Saídas"}>
            <Card className="divide-y divide-line overflow-hidden">
              {cats.filter((c) => c.type === type).map((c) => (
                <CatRow key={c.id} c={c} />
              ))}
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-medium text-accent hover:bg-hover [&::-webkit-details-marker]:hidden">
                  + Nova categoria de {type === "receita" ? "entrada" : "saída"}
                </summary>
                <div className="border-t border-line bg-bg/60 px-4 py-5">
                  <ActionForm action={saveCategory} resetOnSuccess>
                    <input type="hidden" name="type" value={type} />
                    <Field label="Nome">
                      <Input name="name" required maxLength={60} placeholder={type === "receita" ? "Ex.: Avaliação avulsa" : "Ex.: Material de limpeza"} />
                    </Field>
                    <ColorPick name="color" value={null} />
                    <SubmitButton size="md">Criar</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            </Card>
          </Section>
        ))}
      </div>
    </>
  );
}
