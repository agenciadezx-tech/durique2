import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { Avatar, Card, EmptyState, LinkButton } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, monthRange, todayISO } from "@/lib/format";
import { payCommission } from "../actions";
import { MonthNav } from "../month-nav";

export const metadata = { title: "Comissões" };

type Row = {
  professional_id: string;
  professional_name: string;
  sessions: number;
  base_cents: number;
  commission_cents: number;
  paid_cents: number;
};

export default async function ComissoesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [{ data }, { data: pros }] = await Promise.all([
    supabase.rpc("commission_report", { p_clinic: ctx.clinicId, p_from: from, p_to: to }),
    supabase.from("professionals").select("id, commission_percent, commission_fixed_cents").eq("clinic_id", ctx.clinicId),
  ]);
  const rows = (data ?? []) as Row[];
  const rule = new Map((pros ?? []).map((p) => [p.id, p]));
  const noneConfigured = (pros ?? []).every((p) => p.commission_percent == null && p.commission_fixed_cents == null);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Comissões</h1>
          <p className="text-[15px] text-muted">Calculadas pelas sessões em que o paciente veio.</p>
        </div>
        <MonthNav month={month} base="/financeiro/comissoes" />
      </header>

      {noneConfigured && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[15px] text-muted">Defina a comissão de cada profissional (% ou valor por sessão) em Ajustes.</p>
          <LinkButton href="/ajustes" variant="secondary" size="sm">
            Ir para Ajustes
          </LinkButton>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma sessão realizada neste mês" text="Quando marcar “Veio” na agenda, as comissões aparecem aqui." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const due = Math.max(0, r.commission_cents - r.paid_cents);
            const p = rule.get(r.professional_id);
            const ruleText =
              p?.commission_percent != null
                ? `${Number(p.commission_percent)}% do valor da sessão`
                : p?.commission_fixed_cents != null
                  ? `${formatMoney(p.commission_fixed_cents)} por sessão`
                  : "Sem comissão definida";
            return (
              <Card key={r.professional_id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={r.professional_name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.professional_name}</p>
                    <p className="text-sm text-muted">{ruleText}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-semibold tabular-nums">{formatMoney(r.commission_cents)}</p>
                    <p className="text-[13px] text-muted">
                      {r.sessions} {r.sessions === 1 ? "sessão" : "sessões"} · base {formatMoney(r.base_cents)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
                  {r.paid_cents > 0 && (
                    <span className="flex items-center gap-1 text-sm text-ok">
                      <Check size={16} /> {formatMoney(r.paid_cents)} já pago
                    </span>
                  )}
                  {due > 0 ? (
                    <form action={payCommission}>
                      <input type="hidden" name="professional_id" value={r.professional_id} />
                      <input type="hidden" name="name" value={r.professional_name} />
                      <input type="hidden" name="amount_cents" value={due} />
                      <input type="hidden" name="month" value={month} />
                      <ConfirmSubmit
                        variant="primary"
                        size="sm"
                        question={`Registrar o pagamento de ${formatMoney(due)} para ${r.professional_name}? Vai entrar como despesa paga hoje.`}
                      >
                        Pagar {formatMoney(due)}
                      </ConfirmSubmit>
                    </form>
                  ) : (
                    r.commission_cents > 0 && <span className="text-sm font-medium text-ok">Tudo pago</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
