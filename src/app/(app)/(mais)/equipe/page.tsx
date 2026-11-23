import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarCheck, Check, ChevronRight, KeyRound, Minus, UserPlus } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { CopyButton } from "@/components/copy-button";
import { Alert, Badge, Card, cx, EmptyState, Section } from "@/components/ui";
import { WaLink } from "./wa-link";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { proColor } from "@/lib/colors";
import { formatMoney, monthRange, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { payCommission } from "../financeiro/actions";
import { MonthNav } from "../financeiro/month-nav";
import { revokeInvite } from "../ajustes/actions";
import { InviteSheet } from "./invite-sheet";

export const metadata = { title: "Equipe" };

type Role = keyof typeof ROLE_LABEL;
type Member = { member_id: string; user_id: string; email: string; role: Role; active: boolean; professional_name: string | null };
type Row = { professional_id: string; sessions: number; base_cents: number; commission_cents: number; paid_cents: number };
type Person = {
  key: string;
  name: string;
  sub: string;
  role: Role | null;
  attends: boolean;
  active: boolean;
  color: string | null;
  commission: string | null;
  you: boolean;
};

const ACCESS: { label: string; roles: Role[]; note?: string }[] = [
  { label: "Agenda da clínica toda", roles: ["admin", "recepcao", "financeiro"], note: "Profissional vê só a própria" },
  { label: "Marcar Veio / Faltou", roles: ["admin", "recepcao", "profissional"] },
  { label: "Cadastro de pacientes", roles: ["admin", "recepcao", "financeiro"] },
  { label: "Prontuário e evolução", roles: ["admin", "profissional"], note: "Só de quem a pessoa atende" },
  { label: "Receber e cobrar", roles: ["admin", "recepcao", "financeiro"] },
  { label: "Despesas, resultado e comissões", roles: ["admin", "financeiro"] },
  { label: "Ajustes e equipe", roles: ["admin"] },
];
const ROLES = ["admin", "recepcao", "profissional", "financeiro"] as const;
const ROLE_TONE: Record<Role, string> = {
  admin: "bg-accent-soft text-accent",
  profissional: "bg-ok-soft text-ok",
  recepcao: "bg-info-soft text-info",
  financeiro: "bg-warn-soft text-warn",
};

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ mes?: string; f?: string; convite?: string }> }) {
  const ctx = await getContext();
  if (!ctx.isAdmin && !ctx.canSeeExpenses) redirect("/mais");
  const { mes, f, convite } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const filter = f === "inativos" || f === "todos" ? f : "ativos";
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [{ data: pros }, report, membersRes, invitesRes] = await Promise.all([
    supabase.from("professionals").select("id, name, color, member_id, active, commission_percent, commission_fixed_cents, crefito, phone").eq("clinic_id", ctx.clinicId).order("name"),
    ctx.canSeeExpenses ? supabase.rpc("commission_report", { p_clinic: ctx.clinicId, p_from: from, p_to: to }) : Promise.resolve({ data: [] }),
    ctx.isAdmin ? supabase.rpc("clinic_members", { p_clinic: ctx.clinicId }) : Promise.resolve({ data: [] }),
    ctx.isAdmin
      ? supabase
          .from("invites")
          .select("*")
          .eq("clinic_id", ctx.clinicId)
          .is("accepted_at", null)
          .eq("revoked", false)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const invites = (invitesRes.data ?? []) as { id: string; email: string; role: Role; token: string; name?: string | null; phone?: string | null }[];
  const rows = new Map(((report.data ?? []) as Row[]).map((r) => [r.professional_id, r]));
  const members = (membersRes.data ?? []) as Member[];
  const memberById = new Map(members.map((m) => [m.member_id, m]));
  const linked = new Set((pros ?? []).map((p) => p.member_id).filter(Boolean));

  const people: Person[] = [
    ...(pros ?? []).map((p) => {
      const m = p.member_id ? memberById.get(p.member_id) : undefined;
      return {
        key: p.id,
        name: p.name,
        sub: m ? ROLE_LABEL[m.role] : "Sem login · só aparece na agenda",
        role: m?.role ?? null,
        attends: true,
        active: p.active && (m ? m.active : true),
        color: proColor(p.color, p.id),
        commission:
          p.commission_percent != null ? `${Number(p.commission_percent)}%` : p.commission_fixed_cents != null ? `${formatMoney(p.commission_fixed_cents)}/sessão` : "0%",
        you: m?.user_id === ctx.userId,
      };
    }),
    ...members
      .filter((m) => !linked.has(m.member_id))
      .map((m) => ({
        key: `m-${m.member_id}`,
        name: m.email.split("@")[0],
        sub: `${ROLE_LABEL[m.role]} · ${m.email}`,
        role: m.role,
        attends: false,
        active: m.active,
        color: null,
        commission: null,
        you: m.user_id === ctx.userId,
      })),
  ];
  const shown = people.filter((p) => (filter === "todos" ? true : filter === "ativos" ? p.active : !p.active));
  const counts = { ativos: people.filter((p) => p.active).length, inativos: people.filter((p) => !p.active).length, todos: people.length };
  const totalDue = [...rows.values()].reduce((n, r) => n + Math.max(0, r.commission_cents - r.paid_cents), 0);
  const hh = await headers();
  const origin = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}`;
  const justInvited = convite ? invites.find((i) => i.id === convite) : undefined;
  const inviteText = (i: (typeof invites)[number]) =>
    `Olá${i.name ? `, ${i.name.split(" ")[0]}` : ""}! Este é o seu convite para entrar na ${ctx.clinicName} no Durique: ${origin}/convite/${i.token}`;

  return (
    <div data-wide className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Equipe</h1>
          <p className="text-[15px] text-muted">Quem usa o sistema. A cor identifica o profissional na agenda.</p>
        </div>
        {ctx.canSeeExpenses && <MonthNav month={month} base="/equipe" />}
      </header>

      {justInvited && (
        <Alert tone="ok">
          <span className="block font-semibold">Convite criado para {justInvited.name ?? justInvited.email}.</span>
          <span className="mt-2 flex flex-wrap gap-2">
            {justInvited.phone && <WaLink phone={justInvited.phone} text={inviteText(justInvited)} label="Enviar pelo WhatsApp" />}
            <CopyButton text={`${origin}/convite/${justInvited.token}`} />
          </span>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { l: "Pessoas", n: people.filter((p) => p.active).length, c: "border-accent bg-accent-soft/60" },
          { l: "Atendem", n: people.filter((p) => p.active && p.attends).length, c: "border-line bg-surface", t: "text-ok" },
          { l: "Admins", n: people.filter((p) => p.active && p.role === "admin").length, c: "border-line bg-surface", t: "text-accent" },
        ].map((x) => (
          <div key={x.l} className={cx("rounded-2xl border px-3 py-3 sm:px-4", x.c)}>
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{x.l}</p>
            <p className={cx("mt-1 text-[26px] leading-none font-bold tabular-nums", x.t)}>{x.n}</p>
          </div>
        ))}
      </div>

      {ctx.isAdmin && (
        <div className="space-y-2">
          <InviteSheet full used={(pros ?? []).filter((p) => p.active && p.color).map((p) => p.color as string)} />
          <p className="text-center text-[14px] text-muted">
            Profissional que não vai usar o sistema?{" "}
            <Link href="/equipe/novo" className="font-semibold text-accent">
              Cadastrar só na agenda
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <nav className="inline-flex rounded-full border border-line bg-surface p-1" aria-label="Filtrar equipe">
            {(["ativos", "inativos", "todos"] as const).map((k) => (
              <Link
                key={k}
                href={`/equipe?f=${k}${mes ? `&mes=${mes}` : ""}`}
                aria-current={filter === k ? "page" : undefined}
                className={cx(
                  "flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold capitalize",
                  filter === k ? "bg-accent text-white" : "text-muted hover:text-ink",
                )}
              >
                {k} <span className={cx("text-[13px] font-medium", filter === k ? "text-white/80" : "text-faint")}>{counts[k]}</span>
              </Link>
            ))}
          </nav>

          <Section title={`Membros · ${shown.length}`}>
            {shown.length === 0 ? (
              <EmptyState title={filter === "inativos" ? "Ninguém inativo" : "Ninguém aqui ainda"} text="Convide quem trabalha na clínica para cada um ter o próprio acesso." />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {shown.map((p) => (
                  <Link key={p.key} href={`/equipe/${p.key}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                    <span
                      className="grid size-12 shrink-0 place-items-center rounded-full text-[16px] font-semibold text-white"
                      style={{ background: p.color ?? "var(--color-faint)" }}
                    >
                      {p.name.trim()[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold">{p.name}</span>
                        {p.role === "admin" && <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold", ROLE_TONE.admin)}>Admin</span>}
                        {p.you && <Badge tone="info">Você</Badge>}
                        {!p.active && <Badge>Inativo</Badge>}
                      </span>
                      <span className="block truncate text-[14px] text-muted">{p.sub}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.commission && <span className="rounded-full border border-line px-2.5 py-0.5 text-[13px] font-medium tabular-nums">{p.commission}</span>}
                        {p.attends && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[13px] font-semibold text-ok">
                            <CalendarCheck size={14} /> Atende
                          </span>
                        )}
                        {p.role && p.role !== "admin" && <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", ROLE_TONE[p.role])}>{ROLE_LABEL[p.role]}</span>}
                      </span>
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-faint" />
                  </Link>
                ))}
              </Card>
            )}
            <p className="text-[13px] text-muted">
              Toque num membro para mudar papel, serviços que faz, comissão, cor ou desativar. O <b>administrador</b> vê tudo; o <b>profissional</b> vê a própria agenda e
              os seus pacientes; a <b>recepção</b> marca consultas e cuida do caixa.
            </p>
          </Section>

          {ctx.isAdmin && invites.length > 0 && (
            <Section title={`Convites esperando · ${invites.length}`}>
              <Card className="divide-y divide-line overflow-hidden">
                {invites.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                      <UserPlus size={18} />
                    </span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-medium">{i.name ?? i.email}</p>
                      <p className="truncate text-sm text-muted">
                        {ROLE_LABEL[i.role]} · {i.email}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                      {i.phone && <WaLink phone={i.phone} text={inviteText(i)} label="WhatsApp" />}
                      <CopyButton text={`${origin}/convite/${i.token}`} />
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <ConfirmSubmit size="sm" variant="ghost" question="Cancelar este convite? O link deixa de funcionar.">
                          Cancelar
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                ))}
              </Card>
              <p className="text-[13px] text-muted">O link do convite vale 14 dias.</p>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          {ctx.canSeeExpenses && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold">Comissões</h2>
                {totalDue > 0 && <span className="text-[14px] font-semibold text-ok">{formatMoney(totalDue)} a pagar</span>}
              </div>
              <p className="mt-1 text-[14px] text-muted">Repasse de cada profissional no mês (% do atendimento ou valor por sessão). Muda tocando no profissional.</p>
              <div className="mt-3 space-y-2">
                {(pros ?? [])
                  .filter((p) => p.active)
                  .map((p) => {
                    const r = rows.get(p.id);
                    const due = r ? Math.max(0, r.commission_cents - r.paid_cents) : 0;
                    return (
                      <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-bg px-3 py-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: proColor(p.color, p.id) }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="text-[13px] text-muted">
                            {r?.sessions ?? 0} {r?.sessions === 1 ? "sessão" : "sessões"} · gerou {formatMoney(r?.base_cents ?? 0)}
                            {due > 0 && <b className="text-ok"> · {formatMoney(due)} a pagar</b>}
                          </p>
                        </div>
                        {due > 0 ? (
                          <form action={payCommission}>
                            <input type="hidden" name="professional_id" value={p.id} />
                            <input type="hidden" name="name" value={p.name} />
                            <input type="hidden" name="amount_cents" value={due} />
                            <input type="hidden" name="month" value={month} />
                            <ConfirmSubmit size="sm" variant="primary" question={`Registrar o pagamento de ${formatMoney(due)} para ${p.name}? Vai entrar como despesa paga hoje.`}>
                              Pagar
                            </ConfirmSubmit>
                          </form>
                        ) : r?.commission_cents ? (
                          <span className="flex items-center gap-1 text-[13px] font-medium text-ok">
                            <Check size={14} /> Pago
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </Card>
          )}

          <details className="group rounded-2xl border border-line bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold [&::-webkit-details-marker]:hidden">
              <KeyRound size={16} className="text-accent" /> O que cada função vê
              <ChevronRight size={18} className="ml-auto text-faint transition-transform group-open:rotate-90" />
            </summary>
            <table className="w-full border-t border-line text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] text-muted">
                  <th className="px-3 py-2 text-left font-medium">Acesso</th>
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
          </details>
        </aside>
      </div>
    </div>
  );
}
