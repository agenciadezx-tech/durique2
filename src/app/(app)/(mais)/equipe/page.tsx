import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, KeyRound, Minus, UserPlus } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { Avatar, Badge, Card, EmptyState, LinkButton, Section } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { proColor } from "@/lib/colors";
import { formatMoney, monthRange, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { payCommission } from "../financeiro/actions";
import { MonthNav } from "../financeiro/month-nav";
import { RoleSelect } from "./role-select";

export const metadata = { title: "Equipe" };

type Member = { member_id: string; user_id: string; email: string; role: keyof typeof ROLE_LABEL; active: boolean; professional_name: string | null };
type Row = { professional_id: string; sessions: number; base_cents: number; commission_cents: number; paid_cents: number };

/** O que cada função enxerga — mesma regra do banco (RLS). */
const ACCESS: { label: string; roles: (keyof typeof ROLE_LABEL)[]; note?: string }[] = [
  { label: "Agenda da clínica toda", roles: ["admin", "recepcao", "financeiro"], note: "Profissional vê só a própria" },
  { label: "Marcar Veio / Faltou", roles: ["admin", "recepcao", "profissional"] },
  { label: "Cadastro de pacientes", roles: ["admin", "recepcao", "financeiro"] },
  { label: "Prontuário e evolução", roles: ["admin", "profissional"], note: "Só de quem a pessoa atende" },
  { label: "Receber e cobrar", roles: ["admin", "recepcao", "financeiro"] },
  { label: "Despesas, resultado e comissões", roles: ["admin", "financeiro"] },
  { label: "Configurações e equipe", roles: ["admin"] },
];
const ROLES = ["admin", "recepcao", "profissional", "financeiro"] as const;

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await getContext();
  if (!ctx.isAdmin && !ctx.canSeeExpenses) redirect("/mais");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [{ data: pros }, report, membersRes, invites] = await Promise.all([
    supabase.from("professionals").select("id, name, color, member_id, commission_percent, commission_fixed_cents, crefito").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    ctx.canSeeExpenses ? supabase.rpc("commission_report", { p_clinic: ctx.clinicId, p_from: from, p_to: to }) : Promise.resolve({ data: [] }),
    ctx.isAdmin ? supabase.rpc("clinic_members", { p_clinic: ctx.clinicId }) : Promise.resolve({ data: [] }),
    ctx.isAdmin
      ? supabase.from("invites").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId).is("accepted_at", null).eq("revoked", false).gt("expires_at", new Date().toISOString())
      : Promise.resolve({ count: 0 }),
  ]);
  const rows = new Map(((report.data ?? []) as Row[]).map((r) => [r.professional_id, r]));
  const members = (membersRes.data ?? []) as Member[];
  const memberById = new Map(members.map((m) => [m.member_id, m]));
  const linked = new Set((pros ?? []).map((p) => p.member_id).filter(Boolean));
  const others = members.filter((m) => !linked.has(m.member_id));
  const totalDue = [...rows.values()].reduce((n, r) => n + Math.max(0, r.commission_cents - r.paid_cents), 0);

  function access(m: Member | undefined, who: string) {
    if (!ctx.isAdmin) return null;
    if (!m) return <Badge>Sem login</Badge>;
    if (m.user_id === ctx.userId) return <Badge tone="info">Você · {ROLE_LABEL[m.role]}</Badge>;
    if (!m.active) return <Badge>Sem acesso</Badge>;
    return <RoleSelect memberId={m.member_id} role={m.role} who={who} />;
  }

  return (
    <div data-wide>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Equipe</h1>
          <p className="text-[15px] text-muted">Quem trabalha na clínica, o que cada um vê e as comissões do mês.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.canSeeExpenses && <MonthNav month={month} base="/equipe" />}
          {ctx.isAdmin && (
            <LinkButton href="/ajustes/equipe" size="md">
              <UserPlus size={17} /> Convidar
            </LinkButton>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Section
            title="Quem atende"
            action={
              ctx.canSeeExpenses && totalDue > 0 ? <span className="text-sm text-muted">A pagar no mês: <b className="text-ink">{formatMoney(totalDue)}</b></span> : undefined
            }
          >
            {!pros?.length ? (
              <EmptyState title="Nenhum profissional cadastrado" text="Cadastre quem atende para montar a agenda e calcular a comissão." action={<LinkButton href="/ajustes/profissionais">Cadastrar profissional</LinkButton>} />
            ) : (
              <div className="space-y-3">
                {pros.map((p) => {
                  const r = rows.get(p.id);
                  const due = r ? Math.max(0, r.commission_cents - r.paid_cents) : 0;
                  const rule =
                    p.commission_percent != null
                      ? `${Number(p.commission_percent)}% da sessão`
                      : p.commission_fixed_cents != null
                        ? `${formatMoney(p.commission_fixed_cents)} por sessão`
                        : "Sem comissão definida";
                  const m = p.member_id ? memberById.get(p.member_id) : undefined;
                  return (
                    <Card key={p.id} className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="relative">
                          <Avatar name={p.name} />
                          <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface" style={{ background: proColor(p.color, p.id) }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-sm text-muted">{[m?.email, p.crefito && `CREFITO ${p.crefito}`].filter(Boolean).join(" · ") || "Profissional"}</p>
                        </div>
                        {access(m, p.name)}
                      </div>
                      {ctx.canSeeExpenses && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-sm">
                          <span className="text-muted">
                            <b className="text-ink tabular-nums">{r?.sessions ?? 0}</b> {r?.sessions === 1 ? "sessão" : "sessões"} no mês
                          </span>
                          <span className="text-muted">
                            Gerou <b className="text-ink tabular-nums">{formatMoney(r?.base_cents ?? 0)}</b>
                          </span>
                          <span className="text-muted">
                            Comissão <b className="text-ink tabular-nums">{formatMoney(r?.commission_cents ?? 0)}</b> · {rule}
                          </span>
                          <span className="ml-auto flex items-center gap-3">
                            {!!r?.paid_cents && (
                              <span className="flex items-center gap-1 text-ok">
                                <Check size={15} /> {formatMoney(r.paid_cents)} pago
                              </span>
                            )}
                            {due > 0 ? (
                              <form action={payCommission}>
                                <input type="hidden" name="professional_id" value={p.id} />
                                <input type="hidden" name="name" value={p.name} />
                                <input type="hidden" name="amount_cents" value={due} />
                                <input type="hidden" name="month" value={month} />
                                <ConfirmSubmit size="sm" variant="primary" question={`Registrar o pagamento de ${formatMoney(due)} para ${p.name}? Vai entrar como despesa paga hoje.`}>
                                  Pagar {formatMoney(due)}
                                </ConfirmSubmit>
                              </form>
                            ) : (
                              !!r?.commission_cents && <span className="font-medium text-ok">Tudo pago</span>
                            )}
                          </span>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>

          {ctx.isAdmin && (
            <Section title="Recepção, financeiro e administração">
              {others.length ? (
                <Card className="divide-y divide-line overflow-hidden">
                  {others.map((m) => (
                    <div key={m.member_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Avatar name={m.email} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.email}</p>
                        <p className="text-sm text-muted">{ROLE_LABEL[m.role]}</p>
                      </div>
                      {access(m, m.email)}
                    </div>
                  ))}
                </Card>
              ) : (
                <EmptyState title="Só os profissionais por enquanto" text="Convide a recepção ou quem cuida do financeiro para cada um ter o próprio login." />
              )}
              {!!invites.count && (
                <p className="text-sm text-muted">
                  {invites.count} convite(s) esperando a pessoa aceitar ·{" "}
                  <Link href="/ajustes/equipe" className="font-medium text-accent">
                    ver convites
                  </Link>
                </p>
              )}
            </Section>
          )}
        </div>

        <aside>
          <Section title="O que cada função vê">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="px-3 py-2 text-left font-medium">
                      <KeyRound size={14} className="inline" /> Acesso
                    </th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-1 py-2 font-medium" title={ROLE_LABEL[r]}>
                        {ROLE_LABEL[r].slice(0, 5)}.
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ACCESS.map((a) => (
                    <tr key={a.label}>
                      <td className="px-3 py-2.5">
                        {a.label}
                        {a.note && <span className="block text-[12px] text-muted">{a.note}</span>}
                      </td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-1 text-center">
                          {a.roles.includes(r) ? <Check size={16} className="inline text-ok" aria-label="sim" /> : <Minus size={14} className="inline text-faint" aria-label="não" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="text-[13px] text-muted">As regras valem no banco de dados: mesmo quem tentar abrir um link direto não vê o que a função não permite.</p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
