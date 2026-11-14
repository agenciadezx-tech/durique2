import Link from "next/link";
import { Minus, Plus, Undo2 } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { PayButton } from "@/components/finance";
import { WaSendButton } from "@/components/wa-send";
import { firstName, renderTemplate } from "@/lib/messages";
import { Alert, Card, cx, EmptyState, LinkButton } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, formatMoney, monthRange, PAY_LABEL, todayISO } from "@/lib/format";
import { deleteTransaction, unmarkPaid } from "../actions";
import { MonthNav } from "../month-nav";

export const metadata = { title: "Lançamentos" };

type Tx = {
  id: string;
  type: "receita" | "despesa";
  description: string;
  amount_cents: number;
  due_date: string;
  paid_on: string | null;
  payment_method: string | null;
  patient_id: string | null;
  patients: { name: string; phone: string | null } | null;
  categories: { name: string } | null;
};

const FILTERS = [
  { key: "receber", label: "A receber", type: "receita", paid: false },
  { key: "recebidos", label: "Recebidos", type: "receita", paid: true },
  { key: "pagar", label: "A pagar", type: "despesa", paid: false },
  { key: "pagos", label: "Pagos", type: "despesa", paid: true },
] as const;

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; mes?: string; atrasados?: string; salvo?: string }>;
}) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayISO();
  const filters = FILTERS.filter((f) => ctx.canSeeExpenses || f.type === "receita");
  const f = filters.find((x) => x.key === sp.tipo) ?? filters[0];
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const onlyLate = !!sp.atrasados && !f.paid;
  const supabase = await createClient();

  let q = supabase
    .from("transactions")
    .select("id, type, description, amount_cents, due_date, paid_on, payment_method, patient_id, patients(name, phone), categories(name)")
    .eq("clinic_id", ctx.clinicId)
    .eq("type", f.type);
  if (f.paid) q = q.not("paid_on", "is", null).gte("paid_on", from).lte("paid_on", to).order("paid_on", { ascending: false });
  else if (onlyLate) q = q.is("paid_on", null).lt("due_date", today).order("due_date");
  else q = q.is("paid_on", null).gte("due_date", from).lte("due_date", to).order("due_date");
  const { data } = await q.limit(500);
  const rows = (data ?? []) as unknown as Tx[];

  // Atrasados de meses anteriores aparecem no topo quando se olha o mês atual
  let late: Tx[] = [];
  if (!f.paid && !onlyLate && month === today.slice(0, 7)) {
    const { data: l } = await supabase
      .from("transactions")
      .select("id, type, description, amount_cents, due_date, paid_on, payment_method, patient_id, patients(name, phone), categories(name)")
      .eq("clinic_id", ctx.clinicId)
      .eq("type", f.type)
      .is("paid_on", null)
      .lt("due_date", from)
      .order("due_date");
    late = (l ?? []) as unknown as Tx[];
  }
  const all = [...late, ...rows];
  const { data: wa } = await supabase.from("whatsapp_settings").select("tpl_cobranca").eq("clinic_id", ctx.clinicId).maybeSingle();
  const total = all.reduce((a, t) => a + t.amount_cents, 0);
  const back = `/financeiro/lancamentos?tipo=${f.key}&mes=${month}`;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Lançamentos</h1>
        <div className="flex gap-2">
          <LinkButton href="/financeiro/novo?tipo=receita" variant="secondary" size="md">
            <Plus size={18} /> Receita
          </LinkButton>
          {ctx.canSeeExpenses && (
            <LinkButton href="/financeiro/novo?tipo=despesa" variant="secondary" size="md">
              <Minus size={18} /> Despesa
            </LinkButton>
          )}
        </div>
      </header>

      {sp.salvo && (
        <div className="mb-4">
          <Alert tone="ok">Lançamento salvo.</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-hover p-1" role="tablist">
          {filters.map((x) => (
            <Link
              key={x.key}
              href={`/financeiro/lancamentos?tipo=${x.key}&mes=${month}`}
              role="tab"
              aria-selected={x.key === f.key}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                x.key === f.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {x.label}
            </Link>
          ))}
        </div>
        {!onlyLate && <MonthNav month={month} base="/financeiro/lancamentos" params={{ tipo: f.key }} />}
      </div>

      {onlyLate && (
        <p className="mb-4 text-[15px] text-muted">
          Mostrando só os vencidos.{" "}
          <Link href={back} className="font-medium text-accent hover:underline">
            Ver o mês todo
          </Link>
        </p>
      )}

      {all.length === 0 ? (
        <EmptyState
          title={f.paid ? "Nada por aqui neste mês" : "Tudo em dia!"}
          text={f.paid ? "Os lançamentos com baixa aparecem aqui." : f.type === "receita" ? "Nenhuma cobrança em aberto neste mês." : "Nenhuma conta a pagar neste mês."}
        />
      ) : (
        <>
          <p className="mb-2 text-right text-sm text-muted">
            {all.length} lançamento{all.length === 1 ? "" : "s"} · <span className="font-semibold text-ink tabular-nums">{formatMoney(total)}</span>
          </p>
          <Card className="divide-y divide-line overflow-hidden">
            {all.map((t) => {
              const isLate = !t.paid_on && t.due_date < today;
              const who = t.patients?.name;
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                  <div className="w-12 shrink-0 text-center">
                    <p className={cx("text-[17px] leading-none font-semibold tabular-nums", isLate && "text-bad")}>
                      {(t.paid_on ?? t.due_date).slice(8, 10)}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">{formatDateShort(t.paid_on ?? t.due_date).slice(3, 5)}/{(t.paid_on ?? t.due_date).slice(2, 4)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.patient_id && who ? (
                        <Link href={`/pacientes/${t.patient_id}`} className="hover:underline">
                          {who}
                        </Link>
                      ) : (
                        t.description
                      )}
                    </p>
                    <p className={cx("truncate text-sm", isLate ? "text-bad" : "text-muted")}>
                      {who ? t.description : t.categories?.name ?? (t.type === "receita" ? "Receita" : "Despesa")}
                      {isLate && " · vencido"}
                      {t.paid_on && t.payment_method && ` · ${PAY_LABEL[t.payment_method]}`}
                    </p>
                  </div>
                  <span className={cx("font-semibold tabular-nums", t.type === "despesa" && "text-ink")}>
                    {t.type === "despesa" ? "− " : ""}
                    {formatMoney(t.amount_cents)}
                  </span>
                  <div className="flex w-full justify-end gap-1 sm:w-auto">
                    {t.paid_on ? (
                      <form action={unmarkPaid}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmit size="sm" variant="ghost" question="Desfazer a baixa? O lançamento volta para em aberto.">
                          <Undo2 size={16} /> Desfazer
                        </ConfirmSubmit>
                      </form>
                    ) : (
                      <>
                        {t.type === "receita" && t.patient_id && t.patients?.phone && wa && (
                          <WaSendButton
                            compact
                            phone={t.patients.phone}
                            kind="cobranca"
                            patientId={t.patient_id}
                            transactionId={t.id}
                            body={renderTemplate(wa.tpl_cobranca, {
                              nome: firstName(t.patients.name),
                              descricao: t.description,
                              valor: formatMoney(t.amount_cents),
                              vencimento: formatDateShort(t.due_date),
                              clinica: ctx.clinicName,
                            })}
                          />
                        )}
                        <PayButton id={t.id} type={t.type} amountLabel="" back={back} />
                      </>
                    )}
                    {ctx.canSeeExpenses && (
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="back" value={back} />
                        <ConfirmSubmit size="sm" variant="ghost" question={`Excluir “${t.description}”? Não dá para desfazer.`}>
                          Excluir
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}
