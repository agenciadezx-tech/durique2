import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Download, FileText } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { buttonClass, Card, cx, Field, Input, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { buildCarneLeao, CARNE_LEAO_MAX_LINES } from "@/lib/carne-leao";
import { formatDateShort, formatMoney, formatMonth, monthRange, todayISO, addMonthsKey } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { MonthNav } from "../month-nav";
import { saveOcupacao } from "./actions";

export const metadata = { title: "Carnê-Leão" };

export default async function CarneLeaoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : addMonthsKey(todayISO().slice(0, 7), -1);
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [{ data: st }, { data }, { count: withoutPatient }] = await Promise.all([
    supabase.from("clinic_settings").select("carne_leao_ocupacao").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase
      .from("transactions")
      .select("paid_on, amount_cents, description, patients!inner(id, name, cpf)")
      .eq("clinic_id", ctx.clinicId)
      .eq("type", "receita")
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on"),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", ctx.clinicId)
      .eq("type", "receita")
      .is("patient_id", null)
      .gte("paid_on", from)
      .lte("paid_on", to),
  ]);
  type R = { paid_on: string; amount_cents: number; description: string; patients: { id: string; name: string; cpf: string | null } };
  const rows = (data ?? []) as unknown as R[];
  const ocup = st?.carne_leao_ocupacao ?? "";
  const { included, missing } = buildCarneLeao(
    rows.map((r) => ({ paid_on: r.paid_on, amount_cents: r.amount_cents, description: r.description, patient_name: r.patients.name, patient_cpf: r.patients.cpf })),
    ocup || "000",
  );
  const total = included.reduce((a, r) => a + r.amount_cents, 0);
  const missingPatients = [...new Map(rows.filter((r) => !r.patients.cpf).map((r) => [r.patients.id, r.patients])).values()];

  return (
    <>
      <PageHeader
        title="Carnê-Leão"
        description="Gera o arquivo do mês para importar no Carnê-Leão Web da Receita, sem digitar recibo por recibo."
        back={{ href: "/financeiro/notas", label: "Notas fiscais" }}
      />
      <div className="space-y-8">
        <Card className="p-5 sm:p-6">
          <ActionForm action={saveOcupacao}>
            <Field
              label="Código de ocupação no Carnê-Leão"
              hint="São 3 números. Veja no Carnê-Leão Web, em Ocupação principal (o mesmo usado na sua declaração). Basta informar uma vez."
            >
              <Input name="ocupacao" inputMode="numeric" maxLength={3} defaultValue={ocup} placeholder="Ex.: 000" className="max-w-40" />
            </Field>
            <SubmitButton size="md" variant="secondary">
              Salvar código
            </SubmitButton>
          </ActionForm>
        </Card>

        <Section title="Arquivo do mês">
          <div className="flex justify-center sm:justify-start">
            <MonthNav month={month} base="/financeiro/carne-leao" />
          </div>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Recebido de pacientes em {formatMonth(month).toLowerCase()}</p>
                <p className="text-[26px] font-semibold tracking-tight tabular-nums">{formatMoney(total)}</p>
                <p className="text-sm text-muted">
                  {included.length} recebimento{included.length === 1 ? "" : "s"} no arquivo
                </p>
              </div>
              {ocup && included.length > 0 ? (
                <a href={`/exportar/carne-leao?mes=${month}`} className={buttonClass("primary", "lg")}>
                  <Download size={18} /> Baixar arquivo
                </a>
              ) : (
                <span className={cx(buttonClass("primary", "lg"), "pointer-events-none opacity-50")} aria-disabled>
                  <Download size={18} /> Baixar arquivo
                </span>
              )}
            </div>
            {!ocup && <p className="mt-3 text-sm text-warn">Informe o código de ocupação acima para liberar o arquivo.</p>}
            {included.length > CARNE_LEAO_MAX_LINES && (
              <p className="mt-3 text-sm text-warn">A Receita aceita até 1.000 linhas por arquivo; o arquivo leva as primeiras 1.000.</p>
            )}
          </Card>

          {missing.length > 0 && (
            <Card className="border-warn/40 p-5">
              <p className="flex items-center gap-2 font-medium text-warn">
                <AlertTriangle size={18} /> {missing.length} recebimento{missing.length === 1 ? "" : "s"} fora do arquivo por falta de CPF
              </p>
              <p className="mt-1 text-sm text-muted">A Receita exige o CPF de quem pagou. Complete o cadastro e baixe de novo:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {missingPatients.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pacientes/${p.id}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm font-medium hover:bg-hover">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(withoutPatient ?? 0) > 0 && (
            <p className="text-sm text-muted">
              {withoutPatient} receita{withoutPatient === 1 ? "" : "s"} sem paciente (ex.: repasse do Wellhub/TotalPass ou venda avulsa) não entra{withoutPatient === 1 ? "" : "m"}: o
              Carnê-Leão é só para valores recebidos de pessoa física.
            </p>
          )}

          {included.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Ver o que vai no arquivo</summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {included.map((r, i) => (
                  <li key={i} className="flex justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate">
                      {formatDateShort(r.paid_on)} · {r.patient_name} · {r.description}
                    </span>
                    <span className="tabular-nums">{formatMoney(r.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>

        <Section title="Como importar na Receita">
          <Card className="p-5 text-[15px] sm:p-6">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Entre no <strong>Carnê-Leão Web</strong> pelo site da Receita (conta gov.br).
              </li>
              <li>
                Vá em <strong>Escrituração → Importar Escrituração</strong> e escolha o arquivo baixado.
              </li>
              <li>
                Clique em <strong>Analisar arquivo</strong>. Se alguma linha tiver erro, a Receita mostra qual é; as outras podem ser importadas.
              </li>
              <li>Confira os valores e gere o DARF do mês, se houver imposto.</li>
            </ol>
            <p className="mt-4 flex gap-2 rounded-xl bg-hover px-4 py-3 text-sm text-muted">
              <FileText size={18} className="shrink-0" />
              O arquivo segue o modelo oficial da Receita para trabalho não assalariado recebido de pessoa física, com o paciente como quem pagou e
              quem recebeu o atendimento. Se outra pessoa pagou (ex.: pai de um menor), ajuste no Carnê-Leão. Na dúvida, confirme com seu contador.
            </p>
          </Card>
        </Section>
      </div>
    </>
  );
}
