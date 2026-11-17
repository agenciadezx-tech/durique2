import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarCheck, HandCoins, MessageCircle, Target, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, cx, Field, Input, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney, monthRange, todayISO } from "@/lib/format";
import { GOALS, goalMap, type GoalKey } from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";
import { saveGoals } from "../actions";
import { MonthNav } from "../month-nav";

export const metadata = { title: "Saúde do negócio" };

type Health = {
  consultas: { ticket_pacote: number | null; sessoes: number; capacidade: number | null; altas: number; encerrados: number; churn: number };
  aulas: { ticket_mensal: number | null; vagas: number; ocupadas: number; novas_matriculas: number; saidas: number; ativas_inicio: number };
  sinais: { leads: number; confirmados: number; a_confirmar: number; faltas: number; feitas: number; nps_n: number; nps: number | null };
  caixa: { entrou: number; saiu: number; a_receber: number };
  faltosos: { id: string; name: string; n: number }[];
  atrasados: { id: string; name: string; cents: number; dias: number }[];
};
type Pro = { professional_id: string; professional_name: string; sessions: number; base_cents: number; commission_cents: number };

const pct = (a: number, b: number | null | undefined) => (b ? Math.round((a / b) * 100) : null);
const money0 = (c: number | null | undefined) => (c == null ? "—" : formatMoney(c).replace(/,00$/, ""));

/** Barra realizado × meta, com texto que diz se está bom. */
function GoalBar({
  label,
  value,
  shown,
  goal,
  goalShown,
  lowerIsBetter,
}: {
  label: string;
  value: number | null;
  shown: string;
  goal: number;
  goalShown: string;
  lowerIsBetter?: boolean;
}) {
  const hasGoal = goal > 0;
  const ok = value == null || !hasGoal ? null : lowerIsBetter ? value <= goal : value >= goal;
  const width = value == null || !hasGoal ? 0 : Math.min(100, lowerIsBetter ? (value === 0 ? 100 : Math.min(100, (goal / value) * 100)) : (value / goal) * 100);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px]">{label}</span>
        <span className="shrink-0 text-[17px] font-semibold tabular-nums">{shown}</span>
      </div>
      {hasGoal && value != null && (
        <>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-hover">
            <div className={cx("h-full rounded-full", ok ? "bg-ok" : "bg-warn")} style={{ width: `${Math.max(3, width)}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Meta {lowerIsBetter ? "até " : ""}
            {goalShown} · <span className={ok ? "text-ok" : "text-warn"}>{ok ? "dentro da meta" : "abaixo do esperado"}</span>
          </p>
        </>
      )}
      {!hasGoal && <p className="mt-0.5 text-[13px] text-muted">Sem meta definida</p>}
    </div>
  );
}

export default async function SaudePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [{ data }, { data: goalRows }, { data: proRows }] = await Promise.all([
    supabase.rpc("business_health", { p_clinic: ctx.clinicId, p_from: from, p_to: to }),
    supabase.from("clinic_goals").select("key, target").eq("clinic_id", ctx.clinicId),
    supabase.rpc("commission_report", { p_clinic: ctx.clinicId, p_from: from, p_to: to }),
  ]);
  const h = data as Health | null;
  if (!h) redirect("/financeiro");
  const goal = goalMap(goalRows);
  const pros = ((proRows ?? []) as Pro[]).filter((p) => p.sessions > 0);

  const occC = pct(h.consultas.sessoes, h.consultas.capacidade);
  const occA = pct(h.aulas.ocupadas, h.aulas.vagas);
  const missRate = pct(h.sinais.faltas, h.sinais.feitas);
  const confRate = pct(h.sinais.confirmados, h.sinais.a_confirmar);
  const result = h.caixa.entrou - h.caixa.saiu;

  // Faça esta semana: no máximo 5 coisas, as mais importantes primeiro
  const todo: { icon: LucideIcon; text: string; href: string; cta: string; tone: "bad" | "warn" | "info" }[] = [];
  if (h.atrasados.length)
    todo.push({
      icon: HandCoins,
      text: `${h.atrasados.length} ${h.atrasados.length === 1 ? "paciente está" : "pacientes estão"} com pagamento atrasado (${money0(h.atrasados.reduce((s, a) => s + a.cents, 0))}).`,
      href: "/financeiro/cobrancas",
      cta: "Cobrar",
      tone: "bad",
    });
  if (h.sinais.a_confirmar - h.sinais.confirmados > 0)
    todo.push({
      icon: MessageCircle,
      text: `${h.sinais.a_confirmar - h.sinais.confirmados === 1 ? "1 sessão dos próximos 7 dias ainda está" : `${h.sinais.a_confirmar - h.sinais.confirmados} sessões dos próximos 7 dias ainda estão`} sem confirmação.`,
      href: "/whatsapp",
      cta: "Mandar lembretes",
      tone: "warn",
    });
  if (h.faltosos.length)
    todo.push({
      icon: AlertTriangle,
      text: `${h.faltosos.length} ${h.faltosos.length === 1 ? "paciente faltou" : "pacientes faltaram"} 2 vezes ou mais. Vale uma conversa.`,
      href: "/agenda?f=risco",
      cta: "Ver quem",
      tone: "warn",
    });
  if (occA != null && goal.ocupacao_aulas > 0 && occA < goal.ocupacao_aulas)
    todo.push({ icon: Users, text: `As turmas estão com ${occA}% das vagas ocupadas. Ofereça aula experimental.`, href: "/agenda/vagas?motivo=experimental", cta: "Ver vagas", tone: "info" });
  if (goal.novos_contatos > 0 && h.sinais.leads < goal.novos_contatos)
    todo.push({ icon: UserPlus, text: `${h.sinais.leads} de ${goal.novos_contatos} novos contatos no mês. Divulgue o link da clínica.`, href: "/contatos", cta: "Ver contatos", tone: "info" });

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Saúde do negócio</h1>
          <p className="text-[15px] text-muted">Como a clínica está indo no mês, comparando com as suas metas.</p>
        </div>
        <MonthNav month={month} base="/financeiro/saude" />
      </header>

      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted">Entrou</p>
            <p className="mt-1 text-[26px] leading-none font-semibold tabular-nums">{money0(h.caixa.entrou)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Saiu</p>
            <p className="mt-1 text-[26px] leading-none font-semibold tabular-nums">{money0(h.caixa.saiu)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Sobrou</p>
            <p className={cx("mt-1 text-[26px] leading-none font-semibold tabular-nums", result < 0 ? "text-bad" : "text-ok")}>{money0(result)}</p>
            {h.caixa.a_receber > 0 && <p className="mt-1.5 text-[13px] text-muted">Falta receber {money0(h.caixa.a_receber)}</p>}
          </Card>
        </div>

        <Section title="Faça esta semana">
          {todo.length === 0 ? (
            <Card className="flex items-center gap-3 p-4 text-[15px]">
              <CalendarCheck size={22} className="shrink-0 text-ok" /> Tudo em dia. Nada urgente para resolver agora.
            </Card>
          ) : (
            <Card className="divide-y divide-line">
              {todo.slice(0, 5).map((t) => (
                <div key={t.href} className="flex items-center gap-3 p-4">
                  <span
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      t.tone === "bad" && "bg-bad-soft text-bad",
                      t.tone === "warn" && "bg-warn-soft text-warn",
                      t.tone === "info" && "bg-info-soft text-info",
                    )}
                  >
                    <t.icon size={19} />
                  </span>
                  <p className="min-w-0 flex-1 text-[15px]">{t.text}</p>
                  <Link href={t.href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-accent">
                    {t.cta} <ArrowRight size={16} />
                  </Link>
                </div>
              ))}
            </Card>
          )}
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Consultas">
            <Card className="divide-y divide-line px-4">
              <GoalBar
                label="Agenda ocupada"
                value={occC}
                shown={occC == null ? "—" : `${occC}%`}
                goal={goal.ocupacao_consultas}
                goalShown={`${goal.ocupacao_consultas}%`}
              />
              <GoalBar
                label="Valor médio do pacote"
                value={h.consultas.ticket_pacote}
                shown={money0(h.consultas.ticket_pacote)}
                goal={goal.ticket_pacote}
                goalShown={money0(goal.ticket_pacote)}
              />
              <div className="grid grid-cols-3 gap-2 py-3 text-center">
                <div>
                  <p className="text-[20px] font-semibold tabular-nums">{h.consultas.sessoes}</p>
                  <p className="text-[13px] text-muted">sessões</p>
                </div>
                <div>
                  <p className="text-[20px] font-semibold tabular-nums">{h.consultas.altas}</p>
                  <p className="text-[13px] text-muted">altas</p>
                </div>
                <div>
                  <p className={cx("text-[20px] font-semibold tabular-nums", h.consultas.churn > 0 && "text-warn")}>{h.consultas.churn}</p>
                  <p className="text-[13px] text-muted">pararam no meio</p>
                </div>
              </div>
            </Card>
            {h.consultas.capacidade == null && (
              <p className="px-1 text-[13px] text-muted">
                Para medir a agenda ocupada, preencha os horários de atendimento em{" "}
                <Link href="/ajustes/agendamento-online" className="font-medium text-accent">
                  Página da clínica
                </Link>
                .
              </p>
            )}
          </Section>

          <Section title="Aulas">
            <Card className="divide-y divide-line px-4">
              <GoalBar label="Vagas ocupadas" value={occA} shown={occA == null ? "—" : `${occA}%`} goal={goal.ocupacao_aulas} goalShown={`${goal.ocupacao_aulas}%`} />
              <GoalBar
                label="Mensalidade média"
                value={h.aulas.ticket_mensal}
                shown={money0(h.aulas.ticket_mensal)}
                goal={goal.ticket_mensal}
                goalShown={money0(goal.ticket_mensal)}
              />
              <div className="grid grid-cols-3 gap-2 py-3 text-center">
                <div>
                  <p className="text-[20px] font-semibold tabular-nums">{h.aulas.novas_matriculas}</p>
                  <p className="text-[13px] text-muted">entraram</p>
                </div>
                <div>
                  <p className={cx("text-[20px] font-semibold tabular-nums", h.aulas.saidas > 0 && "text-warn")}>{h.aulas.saidas}</p>
                  <p className="text-[13px] text-muted">saíram</p>
                </div>
                <div>
                  <p className="text-[20px] font-semibold tabular-nums">{pct(h.aulas.saidas, h.aulas.ativas_inicio) ?? 0}%</p>
                  <p className="text-[13px] text-muted">perda no mês</p>
                </div>
              </div>
            </Card>
          </Section>
        </div>

        <Section title="Sinais de alerta">
          <Card className="divide-y divide-line px-4">
            <GoalBar label="Novos contatos" value={h.sinais.leads} shown={String(h.sinais.leads)} goal={goal.novos_contatos} goalShown={String(goal.novos_contatos)} />
            <GoalBar
              label="Faltas"
              value={missRate}
              shown={missRate == null ? "—" : `${missRate}%`}
              goal={goal.faltas_max}
              goalShown={`${goal.faltas_max}%`}
              lowerIsBetter
            />
            <GoalBar
              label={`Satisfação (NPS)${h.sinais.nps_n ? ` · ${h.sinais.nps_n} ${h.sinais.nps_n === 1 ? "resposta" : "respostas"}` : ""}`}
              value={h.sinais.nps}
              shown={h.sinais.nps == null ? "—" : String(h.sinais.nps)}
              goal={goal.nps}
              goalShown={String(goal.nps)}
            />
            <div className="flex items-baseline justify-between gap-3 py-3">
              <span className="text-[15px]">Confirmadas para os próximos 7 dias</span>
              <span className="text-[17px] font-semibold tabular-nums">
                {h.sinais.confirmados} de {h.sinais.a_confirmar}
                {confRate != null && <span className="ml-1 text-sm font-normal text-muted">({confRate}%)</span>}
              </span>
            </div>
          </Card>
        </Section>

        <Section title="Quanto cada profissional gera">
          {pros.length === 0 ? (
            <Card className="p-4 text-[15px] text-muted">Quando marcar “Veio” nas sessões, aparece aqui quanto cada profissional gerou no mês.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {pros.map((p) => (
                <div key={p.professional_id} className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={p.professional_name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.professional_name}</p>
                    <p className="text-sm text-muted">
                      {p.sessions} {p.sessions === 1 ? "sessão" : "sessões"}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-4 text-right text-sm">
                    <div>
                      <dt className="text-muted">Gera</dt>
                      <dd className="font-semibold tabular-nums">{money0(p.base_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Comissão</dt>
                      <dd className="font-semibold tabular-nums">{money0(p.commission_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Fica</dt>
                      <dd className="font-semibold text-ok tabular-nums">{money0(p.base_cents - p.commission_cents)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </Card>
          )}
        </Section>

        {(h.faltosos.length > 0 || h.atrasados.length > 0) && (
          <div className="grid gap-5 lg:grid-cols-2">
            {h.faltosos.length > 0 && (
              <Section title="Faltam com frequência">
                <Card className="divide-y divide-line">
                  {h.faltosos.map((f) => (
                    <Link key={f.id} href={`/pacientes/${f.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 hover:bg-hover">
                      <span className="truncate">{f.name}</span>
                      <Badge tone="warn">{f.n} faltas</Badge>
                    </Link>
                  ))}
                </Card>
              </Section>
            )}
            {h.atrasados.length > 0 && (
              <Section title="Pagamento atrasado">
                <Card className="divide-y divide-line">
                  {h.atrasados.map((a) => (
                    <Link key={a.id} href={`/pacientes/${a.id}?aba=financeiro`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 hover:bg-hover">
                      <span className="truncate">{a.name}</span>
                      <span className="shrink-0 text-sm">
                        <span className="font-semibold tabular-nums">{money0(a.cents)}</span>
                        <span className="ml-1.5 text-bad">há {a.dias} dias</span>
                      </span>
                    </Link>
                  ))}
                </Card>
              </Section>
            )}
          </div>
        )}

        {ctx.isAdmin && (
          <Card id="metas">
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <Target size={20} className="text-accent" />
                <span className="font-medium">Definir metas</span>
                <span className="ml-auto text-sm text-muted group-open:hidden">Abrir</span>
                <span className="ml-auto hidden text-sm text-muted group-open:inline">Fechar</span>
              </summary>
              <div className="border-t border-line px-4 py-5">
                <ActionForm action={saveGoals}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {GOALS.map((g) => (
                      <Field key={g.key} label={g.label + (g.unit === "pct" ? " (%)" : g.unit === "money" ? " (R$)" : "")} hint={g.hint}>
                        <Input
                          name={g.key}
                          inputMode="decimal"
                          defaultValue={
                            g.unit === "money"
                              ? goal[g.key as GoalKey]
                                ? (goal[g.key as GoalKey] / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                                : ""
                              : String(goal[g.key as GoalKey])
                          }
                          placeholder={g.unit === "money" ? "0,00" : "0"}
                        />
                      </Field>
                    ))}
                  </div>
                  <SubmitButton>Salvar metas</SubmitButton>
                </ActionForm>
              </div>
            </details>
          </Card>
        )}
      </div>
    </>
  );
}
