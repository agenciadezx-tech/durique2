import { redirect } from "next/navigation";
import { ColumnChart, DonutChart, StatTile } from "@/components/charts";
import Link from "next/link";
import { Badge, Card, cx, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatDateShort, formatMoney, formatMonth, formatMonthShort } from "@/lib/format";
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

  const { data: fbData } = await supabase
    .from("feedback")
    .select("id, score, comment, created_at, patients(id, name)")
    .eq("clinic_id", ctx.clinicId)
    .gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())
    .order("created_at", { ascending: false });
  const fb = (fbData ?? []) as unknown as { id: string; score: number; comment: string | null; created_at: string; patients: { id: string; name: string } | null }[];
  const fans = fb.filter((f) => f.score >= 9).length;
  const neutral = fb.filter((f) => f.score >= 7 && f.score <= 8).length;
  const unhappy = fb.filter((f) => f.score <= 6).length;
  const nps = fb.length ? Math.round(((fans - unhappy) / fb.length) * 100) : null;
  const pctOf = (n: number) => (fb.length ? Math.round((n / fb.length) * 100) : 0);

  // Wellhub / TotalPass: presenças do mês × valor por check-in
  const { data: appsCfg } = await supabase
    .from("clinic_settings")
    .select("wellhub_enabled, wellhub_value_cents, totalpass_enabled, totalpass_value_cents")
    .eq("clinic_id", ctx.clinicId)
    .maybeSingle();
  const monthStart = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)}-01T00:00:00-03:00`);
  const { data: appVisits } =
    appsCfg?.wellhub_enabled || appsCfg?.totalpass_enabled
      ? await supabase
          .from("appointment_attendees")
          .select("patients!inner(access_via), appointments!inner(starts_at)")
          .eq("clinic_id", ctx.clinicId)
          .eq("status", "presente")
          .not("patients.access_via", "is", null)
          .gte("appointments.starts_at", monthStart.toISOString())
          .lte("appointments.starts_at", new Date().toISOString())
      : { data: [] };
  const visits = (appVisits ?? []) as unknown as { patients: { access_via: string } }[];
  const apps = (
    [
      { k: "wellhub", name: "Wellhub", on: appsCfg?.wellhub_enabled, cents: appsCfg?.wellhub_value_cents },
      { k: "totalpass", name: "TotalPass", on: appsCfg?.totalpass_enabled, cents: appsCfg?.totalpass_value_cents },
    ] as const
  )
    .filter((a) => a.on)
    .map((a) => {
      const n = visits.filter((v) => v.patients.access_via === a.k).length;
      return { ...a, n, total: a.cents != null ? n * a.cents : null };
    });

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
            <DonutChart
              title="Sessões por serviço"
              subtitle="Quem veio · últimos 30 dias"
              data={r.by_service_30d.map((s) => ({ label: s.name, value: s.done }))}
              center={{ value: String(r.by_service_30d.reduce((a, s) => a + s.done, 0)), label: "sessões" }}
              empty="Nenhuma sessão marcada como Veio nos últimos 30 dias."
            />
            <DonutChart
              title="Vieram × faltaram"
              subtitle={formatMonth(cur.month)}
              data={[
                { label: "Vieram", value: cur.done, color: "#2e9e5b" },
                { label: "Faltaram ou desmarcaram em cima da hora", value: cur.missed, color: "#d64545" },
              ]}
              center={{ value: missRate == null ? "—" : `${100 - missRate}%`, label: "vieram" }}
              empty="Nenhuma sessão concluída neste mês ainda."
            />
            <ColumnChart title="Sessões feitas" subtitle="Pacientes que vieram, por mês" data={pts("done")} valueLabel="Sessões" color="#0d9488" />
            <ColumnChart title="Faltas" subtitle="Faltou ou desmarcou em cima da hora" data={pts("missed")} valueLabel="Faltas" color="#d64545" />
            <ColumnChart title="Pacientes novos" subtitle="Cadastrados no mês" data={pts("new_patients")} valueLabel="Pacientes" color="#3b6fd1" />
          </div>
        </Section>

        <Section title="Satisfação dos pacientes">
          {fb.length === 0 ? (
            <Card className="px-4 py-5 text-[15px] text-muted">
              Ainda sem respostas nos últimos 90 dias. A pergunta &quot;De 0 a 10, o quanto você indicaria a clínica?&quot; aparece no link do aluno depois da
              3ª sessão, uma vez a cada 3 meses.
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Nota de satisfação (NPS)"
                  value={`${nps! > 0 ? "+" : ""}${nps}`}
                  tone={nps! >= 50 ? "ok" : nps! >= 0 ? "warn" : "bad"}
                  hint={nps! >= 75 ? "Excelente" : nps! >= 50 ? "Muito boa" : nps! >= 0 ? "Pode melhorar" : "Precisa de atenção"}
                />
                <StatTile label="Fãs (nota 9–10)" value={fans} hint={`${pctOf(fans)}% das respostas`} />
                <StatTile label="Neutros (7–8)" value={neutral} hint={`${pctOf(neutral)}% das respostas`} />
                <StatTile label="Insatisfeitos (0–6)" value={unhappy} hint={`${pctOf(unhappy)}% das respostas`} tone={unhappy ? "bad" : undefined} />
              </div>
              <DonutChart
                title="Como os pacientes avaliam"
                subtitle={`${fb.length} resposta${fb.length === 1 ? "" : "s"} nos últimos 90 dias`}
                data={[
                  { label: "Fãs (9–10)", value: fans, color: "#2e9e5b" },
                  { label: "Neutros (7–8)", value: neutral, color: "#e3a21a" },
                  { label: "Insatisfeitos (0–6)", value: unhappy, color: "#d64545" },
                ]}
                center={{ value: `${nps! > 0 ? "+" : ""}${nps}`, label: "NPS" }}
                empty="Sem respostas."
              />
              <Card className="divide-y divide-line overflow-hidden">
                {fb.slice(0, 20).map((f) => (
                  <div key={f.id} className={cx("flex gap-3 px-4 py-3", f.score <= 6 && "bg-bad-soft/40")}>
                    <Badge tone={f.score >= 9 ? "ok" : f.score >= 7 ? "neutral" : "bad"}>{f.score}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {f.patients ? (
                          <Link href={`/pacientes/${f.patients.id}`} className="font-medium hover:underline">
                            {f.patients.name}
                          </Link>
                        ) : (
                          "Paciente"
                        )}{" "}
                        <span className="text-muted">· {formatDateShort(f.created_at.slice(0, 10))}</span>
                      </p>
                      <p className={cx("text-[15px]", !f.comment && "text-muted italic")}>{f.comment ?? "Sem comentário"}</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </Section>

        {apps.length > 0 && (
          <Section title="Wellhub e TotalPass neste mês">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {apps.map((a) => (
                <StatTile
                  key={a.k}
                  label={`${a.name}: check-ins`}
                  value={a.n}
                  hint={a.total != null ? `≈ ${formatMoney(a.total)} a receber` : "Informe o valor por check-in em Ajustes"}
                />
              ))}
            </div>
            <p className="text-[13px] text-muted">Conta as presenças (&quot;Veio&quot;) de alunos marcados como Wellhub ou TotalPass. Confira com o extrato do app.</p>
          </Section>
        )}

        <Section title="Dinheiro">
          <div className="grid gap-4 lg:grid-cols-2">
            <ColumnChart
              title="Recebido"
              subtitle="Receitas pagas, por mês"
              data={pts("revenue")}
              format={moneyShort}
              valueLabel="Recebido"
              color="#2e9e5b"
            />
            <DonutChart
              title="De onde veio o dinheiro"
              subtitle={`Recebido em ${formatMonth(cur.month).toLowerCase()}`}
              data={r.revenue_by_category_month.map((c) => ({ label: c.name, value: c.cents }))}
              format={moneyShort}
              center={{ value: moneyShort(r.revenue_by_category_month.reduce((a, c) => a + c.cents, 0)), label: "recebido" }}
              empty="Nada recebido este mês ainda."
            />
          </div>
        </Section>
      </div>
    </>
  );
}
