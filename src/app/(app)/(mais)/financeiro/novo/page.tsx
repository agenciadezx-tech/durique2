import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PaidNowFields } from "@/components/finance";
import { Card, cx, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { createTransaction } from "../actions";

export const metadata = { title: "Novo lançamento" };

export default async function NovoLancamentoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await getContext();
  const { tipo } = await searchParams;
  const type = tipo === "despesa" && ctx.canSeeExpenses ? "despesa" : "receita";
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .eq("clinic_id", ctx.clinicId)
    .eq("type", type)
    .eq("active", true)
    .order("name");

  return (
    <>
      <PageHeader title={type === "despesa" ? "Nova despesa" : "Nova receita"} back={{ href: "/financeiro", label: "Financeiro" }} />
      {ctx.canSeeExpenses && (
        <div className="mb-5 grid max-w-xs grid-cols-2 gap-1 rounded-xl bg-hover p-1">
          {(["receita", "despesa"] as const).map((t) => (
            <Link
              key={t}
              href={`/financeiro/novo?tipo=${t}`}
              className={cx(
                "rounded-lg py-2 text-center text-sm font-medium",
                t === type ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t === "receita" ? "Receita (entra)" : "Despesa (sai)"}
            </Link>
          ))}
        </div>
      )}
      <Card className="p-5 sm:p-7">
        <ActionForm action={createTransaction}>
          <input type="hidden" name="type" value={type} />
          <Field label="Descrição" htmlFor="description">
            <Input
              id="description"
              name="description"
              required
              autoFocus
              placeholder={type === "despesa" ? "Ex.: Aluguel da sala" : "Ex.: Venda de faixa elástica"}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor (R$)" htmlFor="amount">
              <Input id="amount" name="amount" inputMode="decimal" required placeholder="0,00" />
            </Field>
            <Field label="Vencimento" htmlFor="due_date">
              <Input id="due_date" name="due_date" type="date" defaultValue={todayISO()} required />
            </Field>
            <Field label="Categoria">
              <Select name="category_id" defaultValue="">
                <option value="">Sem categoria</option>
                {(cats ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Repetir" hint="Para contas fixas, como aluguel.">
              <Select name="repeat" defaultValue="1">
                <option value="1">Não repetir</option>
                {[2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    Todo mês, por {n} meses
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <PaidNowFields label={type === "despesa" ? "Já foi paga" : "Já foi recebida"} />
          <Field label="Observações" hint="Opcional.">
            <Textarea name="notes" rows={2} />
          </Field>
          <SubmitButton full>Salvar lançamento</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
