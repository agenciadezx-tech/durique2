import { redirect } from "next/navigation";
import { BarList, ColumnChart, StatTile } from "@/components/charts";
import { PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney, formatMonth, formatMonthShort } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Relatórios" };

type Report = {
  months: { month: string; done: number; missed: number; new_patients: number; revenue: number; expenses: number }[];
  occupancy_30d: { taken: number; capacity: number };
  by_service_30d: { name: string; done: number }[];
  revenue_by_category_month: { name: string; cents: number }[];
  active_patients: number;
};

const moneyShort = (c: number) =>
  c >= 100000_00 ? `R$ ${(c / 100000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : formatMoney(c).replace(/,00$/, "");

export default async function ReportsPage() {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_overview", { p_clinic: ctx.clinicId, p_months: 6 });
  const r = data as Report | null;
  if (!r) redirect("/financeiro");

  const cur = r.months[r.months.length - 1];
  const prev = r.months[r.months.length - 2];
  const missRate = cur.done + cur.missed > 0 ? Math.round((cur.missed / (cur.done + cur.missed)) * 100) : null;
  const occ = r.occupancy_30d.capacity > 0 ? Math.round((r.occupancy_30d.taken / r.occupancy_30d.capacity) * 100) : null;
  const pts = (key: "done" | "missed" | "new_patients" | "revenue") =>
    r.months.map((m) => ({ label: formatMonthShort(m.month), full: formatMonth(m.month), value: m[key] }));
  const diff = (a: number, b: number | undefined) => {
    if (b == null || b === 0) return null;
    const p = Math.round(((a - b) / b) * 100);
    return `${p >= 0 ? "+" : ""}${p}% vs. ${formatMonthShort(prev.month)}`;
  };

  return (
    <>
      <PageHeader title="Relatórios" description="Como a clínica está indo, mês a mês." />
      <div className="space-y-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Pacientes ativos" value={r.active_patients} hint="vieram nos últimos 30 dias" />
          <StatTile label="Sessões feitas no mês" value={cur.done} hint={diff(cur.done, prev?.done) ?? formatMonth(cur.month)} />
          <StatTile
            label="Faltas no mês"
            value={missRate == null ? "—" : `${missRate}%`}
            tone={missRate == null ? undefined : missRate >= 20 ? "bad" : missRate >= 10 ? "warn" : "ok"}
            hint={missRate == null ? "sem sessões ainda" : `${cur.missed} de ${cur.done + cur.missed} sessões`}
          />
          <StatTile
            label="Ocupação das turmas"
            value={occ == null ? "—" : `${occ}%`}
            hint={occ == null ? "sem turmas nos últimos 30 dias" : `${r.occupancy_30d.taken} de ${r.occupancy_30d.capacity} vagas · 30 dias`}
          />
        </div>

        <Section title="Atendimentos">
          <div className="grid gap-4 lg:grid-cols-2">
            <ColumnChart title="Sessões feitas" subtitle="Pacientes que vieram, por mês" data={pts("done")} valueLabel="Sessões" />
            <ColumnChart title="Faltas" subtitle="Faltou ou desmarcou em cima da hora" data={pts("missed")} valueLabel="Faltas" />
            <ColumnChart title="Pacientes novos" subtitle="Cadastrados no mês" data={pts("new_patients")} valueLabel="Pacientes" />
            <BarList
              title="Sessões por serviço"
              subtitle="Últimos 30 dias"
              data={r.by_service_30d.map((s) => ({ label: s.name, value: s.done }))}
              empty="Nenhuma sessão marcada como Veio nos últimos 30 dias."
            />
          </div>
        </Section>

        <Section title="Dinheiro">
          <div className="grid gap-4 lg:grid-cols-2">
            <ColumnChart
              title="Recebido"
              subtitle="Receitas pagas, por mês"
              data={pts("revenue")}
              format={moneyShort}
              valueLabel="Recebido"
            />
            <BarList
              title="De onde veio o dinheiro"
              subtitle={`Recebido em ${formatMonth(cur.month).toLowerCase()}`}
              data={r.revenue_by_category_month.map((c) => ({ label: c.name, value: c.cents }))}
              format={formatMoney}
              empty="Nada recebido este mês ainda."
            />
          </div>
        </Section>
      </div>
    </>
  );
}
