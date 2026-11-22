import Link from "next/link";
import { AlertTriangle, ChevronDown, Pencil, Plus, Stethoscope, Users } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, cx, Field, Input } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney, todayISO, WEEKDAYS_SHORT } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { createClient } from "@/lib/supabase/server";
import { saveProduct, saveService, toggleActive } from "../(mais)/ajustes/actions";
import { ServiceFields } from "../(mais)/ajustes/shared";
import { archiveRoom, deleteService, duplicateService, saveRoom, saveServiceExtras, saveServicePros, saveServiceRules, savePlanRow, setStartMode } from "./actions";
import { ChoiceCards, PlanWizard, Toggle, ToggleSection } from "./bits";

export type FullService = {
  id: string;
  name: string;
  kind: string;
  duration_min: number;
  default_capacity: number;
  price_cents: number | null;
  active: boolean;
  bookable: boolean;
  cancel_notice_hours: number | null;
  booking_trial: boolean;
  start_mode: string;
  rules_reviewed: boolean;
  early_eve: boolean;
  self_cancel: boolean;
  self_reschedule: boolean;
  reschedule_max_month: number;
  late_reschedule: string;
  noshow_rule: string;
  notice_rule: string;
  makeup_days: number | null;
  makeup_max_month: number;
  requires_evolution: boolean;
  postpaid: boolean;
  family_discount_pct: number | null;
  punctual_discount_pct: number | null;
};
type Product = {
  id: string;
  name: string;
  kind: string;
  price_cents: number;
  sessions: number | null;
  validity_days: number | null;
  sessions_per_week: number | null;
  active: boolean;
  cycle_months: number;
  format: string;
  classes_per_month: number | null;
};

const CYCLES = [
  { c: 1, s: "Mensal" },
  { c: 3, s: "Tri" },
  { c: 6, s: "Sem" },
  { c: 12, s: "Anual" },
] as const;
const money = (c: number | null | undefined) => (c != null ? (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace(".", ",")) : "");
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Bloco numerado que abre e fecha (como um acordeão). */
function Block({ n, title, hint, warn, open, id, children }: { n: string; title: string; hint?: React.ReactNode; warn?: boolean; open?: boolean; id?: string; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className={cx("group scroll-mt-24 rounded-2xl border bg-surface", warn ? "border-warn/40" : "border-line", "open:border-l-4 open:border-l-accent")}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums", warn ? "bg-warn-soft text-warn" : "bg-hover text-muted")}>{n}</span>
        <span className="min-w-0 flex-1 font-semibold">{title}</span>
        {hint && <span className={cx("max-w-[45%] truncate text-right text-[13px]", warn ? "font-medium text-warn" : "text-muted")}>{hint}</span>}
        <ChevronDown size={16} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export async function ServiceDetail({ s, own, aba, bloco, sala, novo, arquivado }: { s: FullService; own: Product[]; aba?: string; bloco?: string; sala?: string; novo?: boolean; arquivado?: boolean }) {
  const ctx = await getContext();
  const admin = ctx.isAdmin;
  const supabase = await createClient();
  const today = todayISO();
  const isAula = s.kind === "turma";
  const [{ data: series }, { data: pros }, { data: links }, { data: rooms }, { data: settings }, { data: avail }, { data: pkgs }] = await Promise.all([
    supabase
      .from("recurring_series")
      .select("id, name, weekday, start_time, duration_min, capacity, room_id, professional_id, professionals(name, color), enrollments(ends_on, patients(id, name))")
      .eq("service_id", s.id)
      .eq("active", true)
      .order("weekday")
      .order("start_time"),
    supabase.from("professionals").select("id, name, color").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professional_services" as never).select("professional_id, service_id").eq("clinic_id", ctx.clinicId),
    supabase.from("rooms" as never).select("id, name, capacity").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("clinic_settings").select("cancel_notice_hours, makeup_validity_days, wellhub_enabled, totalpass_enabled").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("availability").select("professional_id").eq("clinic_id", ctx.clinicId),
    supabase.from("patient_packages").select("id, name, kind, status, patients(id, name)").eq("service_id", s.id).eq("status", "ativo"),
  ]);
  type SeriesRow = {
    id: string;
    name: string | null;
    weekday: number;
    start_time: string;
    duration_min: number;
    capacity: number;
    room_id: string | null;
    professional_id: string;
    professionals: { name: string; color: string | null } | null;
    enrollments: { ends_on: string | null; patients: { id: string; name: string } | null }[];
  };
  const turmas = (series ?? []) as unknown as SeriesRow[];
  const L = (links ?? []) as { professional_id: string; service_id: string }[];
  const does = (pid: string) => !L.some((l) => l.professional_id === pid) || L.some((l) => l.professional_id === pid && l.service_id === s.id);
  const myPros = (pros ?? []).filter((p) => does(p.id));
  const explicitPros = (pros ?? []).filter((p) => L.some((l) => l.professional_id === p.id && l.service_id === s.id));
  const roomList = (rooms ?? []) as { id: string; name: string; capacity: number | null }[];
  const plans = own.filter((p) => p.kind === "plano");
  const packs = own.filter((p) => p.kind !== "plano");
  const activePlans = plans.filter((p) => p.active);
  const notice = s.cancel_notice_hours ?? settings?.cancel_notice_hours ?? 12;
  const hasAvail = (avail ?? []).some((a) => myPros.some((p) => p.id === a.professional_id));

  // Checklist do serviço
  const checks = isAula
    ? [
        { k: "preco", l: "Preço da avulsa", ok: s.price_cents != null, aba: "precos", b: "avulsa" },
        { k: "mensal", l: "Mensalidade", ok: activePlans.length > 0, aba: "precos", b: "mensal" },
        { k: "prof", l: "Professor", ok: explicitPros.length > 0, aba: "turmas", b: "prof" },
        { k: "turma", l: "Turma", ok: turmas.length > 0, aba: "turmas", b: "grade" },
        { k: "regras", l: "Regras", ok: s.rules_reviewed, aba: "regras", b: "faltas" },
      ]
    : [
        { k: "preco", l: "Preço", ok: s.price_cents != null || packs.some((p) => p.active), aba: "precos", b: "avulsa" },
        { k: "prof", l: "Profissional", ok: explicitPros.length > 0, aba: "turmas", b: "prof" },
        { k: "horarios", l: "Horários de atendimento", ok: hasAvail, aba: "turmas", b: "prof" },
        { k: "link", l: "Agendamento online", ok: s.bookable, aba: "turmas", b: "prof" },
        { k: "regras", l: "Regras", ok: s.rules_reviewed, aba: "regras", b: "faltas" },
      ];
  const missing = checks.filter((c) => !c.ok);
  const pendingOf = (a: string) => missing.filter((m) => m.aba === a).length;
  const tab = aba === "turmas" || aba === "regras" || aba === "alunos" ? aba : "precos";
  const href = (o: { aba?: string; b?: string; sala?: string }) => {
    const p = new URLSearchParams({ s: s.id, aba: o.aba ?? tab });
    if (o.b) p.set("b", o.b);
    if (o.sala) p.set("sala", o.sala);
    return `/catalogo?${p.toString()}${o.b ? `#b-${o.b}` : ""}`;
  };

  // Alunos / pacientes do serviço
  const people = new Map<string, { id: string; name: string; how: string }>();
  turmas.forEach((t) =>
    t.enrollments
      .filter((e) => (!e.ends_on || e.ends_on >= today) && e.patients)
      .forEach((e) => people.set(e.patients!.id, { id: e.patients!.id, name: e.patients!.name, how: `Turma ${WEEKDAYS_SHORT[t.weekday]} ${t.start_time.slice(0, 5)}` })),
  );
  ((pkgs ?? []) as unknown as { name: string; patients: { id: string; name: string } | null }[]).forEach((k) => {
    if (!k.patients) return;
    const cur = people.get(k.patients.id);
    people.set(k.patients.id, { id: k.patients.id, name: k.patients.name, how: cur ? `${cur.how} · ${k.name}` : k.name });
  });
  const students = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));

  const Icon = isAula ? Users : Stethoscope;
  const linkWarn = isAula ? (!turmas.length ? "Sem turmas: não aparece para o paciente no link" : !s.bookable ? "Fora do link: o paciente não marca sozinho" : null) : !s.bookable ? "Fora do link: o paciente não marca sozinho" : null;

  // Linhas da tabela de mensalidade: (vezes/semana, formato)
  const rowKeys = [...new Set(plans.map((p) => `${p.sessions_per_week}|${p.format ?? "grupo"}`))].sort();

  return (
    <div className="space-y-5">
      {novo && <Alert tone="ok">Serviço criado. Agora siga o que falta abaixo.</Alert>}
      {arquivado && <Alert tone="info">Este serviço já tem histórico, então foi arquivado em vez de excluído.</Alert>}

      {/* Topo */}
      <header className="flex items-start gap-4">
        <span className={cx("grid size-14 shrink-0 place-items-center rounded-2xl", isAula ? "bg-chart-out/15 text-[#a85a17]" : "bg-accent-soft text-accent")}>
          <Icon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[24px] leading-tight font-semibold tracking-tight">{s.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={cx("rounded-md px-2 py-0.5 text-[12px] font-bold tracking-wide uppercase", isAula ? "bg-chart-out/15 text-[#a85a17]" : "bg-chart-in/15 text-accent")}>
              {isAula ? "Aula" : "Consulta"}
            </span>
            <span className="rounded-lg border border-line px-2 py-0.5 text-[14px]">
              Duração <b>{s.duration_min} min</b>
            </span>
            {isAula && (
              <span className="rounded-lg border border-line px-2 py-0.5 text-[14px]">
                <b>{s.default_capacity}</b> vagas
              </span>
            )}
          </p>
        </div>
      </header>

      {admin && (
        <details className="group rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-medium text-accent [&::-webkit-details-marker]:hidden">
            <Pencil size={16} /> Editar nome, tipo, duração e vagas
          </summary>
          <div className="border-t border-line p-4">
            <ActionForm action={saveService}>
              <input type="hidden" name="id" value={s.id} />
              <ServiceFields s={s} />
              <SubmitButton size="md">Salvar</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}

      {/* Ativo */}
      <form action={toggleActive} className={cx("flex items-center gap-3 rounded-2xl px-4 py-3", s.active ? "bg-ok-soft/70" : "bg-hover")}>
        <input type="hidden" name="table" value="services" />
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="active" value={String(!s.active)} />
        <button type="submit" disabled={!admin} aria-label={s.active ? "Desativar serviço" : "Ativar serviço"} className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", s.active ? "bg-ok" : "bg-faint")}>
          <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", s.active ? "left-6" : "left-1")} />
        </button>
        <span>
          <span className="block font-semibold">{s.active ? "Ativo" : "Inativo"}</span>
          <span className={cx("block text-[14px]", s.active ? "text-ok" : "text-muted")}>{s.active ? "aparece no catálogo, na venda e no agendamento" : "não aparece para vender nem agendar"}</span>
        </span>
      </form>

      {linkWarn && (
        <Card className="flex flex-wrap items-center gap-3 border-warn/40 p-4">
          <span className="size-2.5 shrink-0 rounded-full bg-warn" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{linkWarn}</p>
            <p className="text-[14px] text-muted">
              {isAula && !turmas.length ? "Aula é marcada numa turma. Crie a turma (dia, hora e vagas) e o serviço volta ao link." : "Ligue o agendamento online deste serviço na Página da clínica."}
            </p>
          </div>
          {isAula && !turmas.length ? (
            <Link href={`/horarios/novo?servico=${s.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-hover">
              Criar turma
            </Link>
          ) : (
            <Link href="/ajustes/agendamento-online" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-hover">
              Abrir
            </Link>
          )}
        </Card>
      )}

      {missing.length > 0 && (
        <div className="rounded-2xl border border-warn/30 bg-warn-soft/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 font-semibold text-warn">
              Falta{missing.length === 1 ? "" : "m"} {missing.length} para completar
            </p>
            {missing.map((m) => (
              <Link key={m.k} href={href({ aba: m.aba, b: m.b })} className="inline-flex min-h-10 items-center rounded-full border border-warn/30 bg-surface/70 px-3.5 text-[14px] font-semibold text-warn">
                {m.l} ›
              </Link>
            ))}
            <span className="ml-auto text-[14px] text-warn">
              {checks.length - missing.length}/{checks.length} pronto
            </span>
          </div>
        </div>
      )}

      {/* Abas */}
      <nav className="-mx-5 flex gap-1 overflow-x-auto border-b border-line px-5 lg:mx-0 lg:px-0" aria-label="Partes do serviço">
        {[
          { k: "precos", l: "1 · Preços e planos" },
          { k: "turmas", l: isAula ? "2 · Turmas" : "2 · Profissionais" },
          { k: "regras", l: "3 · Regras" },
          { k: "alunos", l: isAula ? "4 · Alunos" : "4 · Pacientes" },
        ].map((t) => {
          const n = t.k === "alunos" ? students.length : pendingOf(t.k);
          return (
            <Link
              key={t.k}
              href={href({ aba: t.k })}
              aria-current={tab === t.k ? "page" : undefined}
              className={cx(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-[15px] font-semibold whitespace-nowrap",
                tab === t.k ? "border-ink text-ink" : "border-transparent text-muted",
              )}
            >
              {t.l}
              {n > 0 && (
                <span className={cx("grid min-w-5 place-items-center rounded-full px-1 text-[12px] font-bold", t.k === "alunos" ? "bg-hover text-muted" : "bg-warn text-white")}>{n}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ===== 1 · Preços e planos ===== */}
      {tab === "precos" && (
        <div className="space-y-3">
          <Block n="1.1" id="b-avulsa" title={isAula ? "Aula avulsa e experimental" : "Sessão avulsa"} hint={s.price_cents != null ? formatMoney(s.price_cents).replace(/,00$/, "") : "falta preencher"} warn={s.price_cents == null} open={bloco === "avulsa" || (!bloco && s.price_cents == null)}>
            <ActionForm action={saveServiceExtras} className="space-y-4">
              <input type="hidden" name="id" value={s.id} />
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <span className="size-2.5 rounded-full bg-ok" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{isAula ? "Aula avulsa" : "Sessão avulsa"}</span>
                  <span className="block text-[14px] text-muted">só nesta data, sem pacote</span>
                </span>
                <span className="w-32">
                  <Input name="price" inputMode="decimal" defaultValue={money(s.price_cents)} placeholder="R$ 0,00" aria-label="Preço da avulsa" />
                </span>
              </Card>
              {isAula && (
                <>
                  <Card className="flex flex-wrap items-center gap-3 p-4">
                    <span className="size-2.5 rounded-full bg-ok" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Aula experimental</span>
                      <span className="block text-[14px] text-muted">uma vez por pessoa</span>
                    </span>
                    <span className="text-right text-[14px] font-semibold">
                      na venda
                      <span className="block text-[13px] font-normal text-muted">grátis ou valor</span>
                    </span>
                  </Card>
                  <p className="text-[14px] text-muted">A experimental não tem preço fixo: a recepção escolhe o valor (ou grátis) na hora de marcar. Não desconta de pacote.</p>
                  <input type="hidden" name="booking_trial_present" value="1" />
                  <Toggle
                    name="booking_trial"
                    defaultChecked={s.booking_trial}
                    title="Aula experimental pelo link"
                    desc={turmas.length ? "Quem nunca veio marca uma aula para conhecer, numa turma com vaga. Uma vez por pessoa." : "Sem turma, o link não tem horário para oferecer. Crie a turma em 2 · Turmas."}
                  />
                </>
              )}
              {admin && <SubmitButton size="md">Salvar</SubmitButton>}
            </ActionForm>
          </Block>

          {isAula && (
            <Block
              n="1.2"
              id="b-mensal"
              title="Mensalidade"
              hint={activePlans.length ? activePlans.filter((p) => p.cycle_months === 1).map((p) => `${p.sessions_per_week}x ${formatMoney(p.price_cents).replace(/,00$/, "")}`).join(" · ") : "falta preencher · sem isso não matricula"}
              warn={!activePlans.length}
              open={bloco === "mensal" || (!bloco && s.price_cents != null && !activePlans.length)}
            >
              {rowKeys.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-warn/50 bg-warn-soft/40 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-warn">Cadastre a mensalidade: 1x, 2x, 3x por semana</span>
                    <span className="block text-[14px] text-muted">Sem plano, {s.name} não aparece como mensalidade na matrícula.</span>
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {rowKeys.map((k) => (
                      <span key={k} className="rounded-full border border-ok/40 bg-ok-soft px-3 py-1 text-[14px] font-semibold text-ok">
                        {k.split("|")[0]}x ✓
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))_auto] items-end gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                      <span>R$/mês</span>
                      {CYCLES.map((c) => (
                        <span key={c.c}>{c.s}</span>
                      ))}
                      <span />
                    </div>
                    {rowKeys.map((k) => {
                      const [pw, fmt] = k.split("|");
                      const cell = (c: number) => plans.find((p) => `${p.sessions_per_week}|${p.format ?? "grupo"}` === k && p.cycle_months === c && p.active);
                      return (
                        <ActionForm key={k} action={savePlanRow} className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))_auto] items-center gap-1.5 space-y-0!">
                          <input type="hidden" name="service_id" value={s.id} />
                          <input type="hidden" name="sessions_per_week" value={pw} />
                          <input type="hidden" name="format" value={fmt} />
                          <input type="hidden" name="classes_per_month" value={cell(1)?.classes_per_month ?? ""} />
                          <span className="leading-tight">
                            <b>{pw}x</b>
                            <span className="block text-[11px] font-semibold text-ok uppercase">{fmt}</span>
                          </span>
                          {CYCLES.map((c) => (
                            <input
                              key={c.c}
                              name={`p${c.c}`}
                              inputMode="decimal"
                              defaultValue={money(cell(c.c)?.price_cents)}
                              placeholder={c.c === 1 ? "base" : "+"}
                              aria-label={`${pw}x ${c.s}`}
                              className={cx(
                                "h-11 w-full min-w-0 rounded-xl border px-1 text-center text-[16px] font-semibold tabular-nums placeholder:font-normal placeholder:text-faint",
                                cell(c.c) ? "border-ok/40 bg-ok-soft/60" : "border-dashed border-line bg-surface",
                              )}
                            />
                          ))}
                          {admin && (
                            <SubmitButton size="sm" variant="secondary">
                              OK
                            </SubmitButton>
                          )}
                        </ActionForm>
                      );
                    })}
                  </div>
                  <p className="text-[13px] text-muted">Tri = 3 meses · Sem = 6 meses · Anual = 12 meses. Valor por mês; o ciclo é cobrado adiantado. Vazio = não vende.</p>
                </>
              )}
              {admin && <PlanWizard serviceId={s.id} serviceName={s.name} taken={rowKeys} />}
            </Block>
          )}

          <Block n={isAula ? "1.3" : "1.2"} id="b-pacotes" title={isAula ? "Pacotes de créditos" : "Pacotes de sessões"} hint={packs.filter((p) => p.active).length ? packs.filter((p) => p.active).map((p) => p.sessions).join(" e ") + (isAula ? " aulas" : " sessões") : "opcional"} open={bloco === "pacotes"}>
            {packs.map((p) => (
              <details key={p.id} className={cx("group rounded-2xl border border-line bg-surface", !p.active && "opacity-60")}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className={cx("size-2.5 shrink-0 rounded-full", p.active ? "bg-ok" : "bg-faint")} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block text-[14px] text-muted">
                      {p.sessions} {isAula ? "aulas" : "sessões"}
                      {p.validity_days ? ` · vale ${p.validity_days} dias` : ""}
                      {!p.active && " · fora de venda"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{formatMoney(p.price_cents)}</span>
                    {p.sessions ? <span className="block text-[13px] text-muted tabular-nums">{formatMoney(Math.round(p.price_cents / p.sessions))}/{isAula ? "aula" : "sessão"}</span> : null}
                  </span>
                </summary>
                {admin && (
                  <div className="space-y-3 border-t border-line p-4">
                    <PackFields p={p} serviceId={s.id} />
                    <form action={toggleActive}>
                      <input type="hidden" name="table" value="products" />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <SubmitButton variant="ghost" size="sm" pendingText="Aguarde…">
                        {p.active ? "Parar de vender" : "Voltar a vender"}
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </details>
            ))}
            {admin && (
              <details className="group rounded-xl border border-dashed border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-semibold text-ok [&::-webkit-details-marker]:hidden">
                  <Plus size={17} /> Novo pacote
                </summary>
                <div className="border-t border-line p-4">
                  <PackFields serviceId={s.id} />
                </div>
              </details>
            )}
          </Block>

          <Block n={isAula ? "1.4" : "1.3"} title="Convênios e parceiros" hint={[settings?.wellhub_enabled && "Wellhub", settings?.totalpass_enabled && "TotalPass"].filter(Boolean).join(" · ") || "nenhum"}>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-4">
              <p className="min-w-0 flex-1 text-[15px] text-muted">Aceita Wellhub, TotalPass ou convênio? Ligue e coloque o valor por check-in em Ajustes.</p>
              <Link href="/ajustes/apps" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-[14px] font-semibold text-accent">
                + Abrir
              </Link>
            </div>
          </Block>

          <Block n={isAula ? "1.5" : "1.4"} title="Pós-pago" hint={s.postpaid ? "ligado" : "desligado"}>
            <ActionForm action={saveServiceExtras} className="space-y-3">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="postpaid_present" value="1" />
              <Toggle
                name="postpaid"
                defaultChecked={s.postpaid}
                title="Cobrar no fim do mês o que a pessoa fez"
                desc={`Quem vem sem pacote: cada "Veio" vira uma cobrança de ${s.price_cents != null ? formatMoney(s.price_cents) : "(coloque o preço da avulsa)"} com vencimento no último dia do mês.`}
              />
              {admin && <SubmitButton size="md">Salvar</SubmitButton>}
            </ActionForm>
          </Block>

          <Block n={isAula ? "1.6" : "1.5"} title="Descontos" hint={[s.family_discount_pct && `família ${Number(s.family_discount_pct)}%`, s.punctual_discount_pct && `pontualidade ${Number(s.punctual_discount_pct)}%`].filter(Boolean).join(" · ") || "sem desconto"}>
            <ActionForm action={saveServiceExtras} className="space-y-4">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="discounts_present" value="1" />
              <p className="text-[13px] font-bold tracking-wide text-muted">{isAula ? "1.6.1" : "1.5.1"} FAMÍLIA</p>
              <ToggleSection name="family_on" defaultChecked={s.family_discount_pct != null} title="Plano família" desc="Desconto para quem tem alguém da família no estúdio. Aparece para marcar na venda.">
                <Field label="Desconto (%)">
                  <Input name="family_discount_pct" inputMode="decimal" defaultValue={s.family_discount_pct ?? 10} className="max-w-32" />
                </Field>
              </ToggleSection>
              <p className="text-[13px] font-bold tracking-wide text-muted">{isAula ? "1.6.2" : "1.5.2"} PONTUALIDADE</p>
              <ToggleSection name="punctual_on" defaultChecked={s.punctual_discount_pct != null} title="Desconto para quem paga em dia" desc="Aparece na cobrança: “pagando até o vencimento, sai por …”.">
                <Field label="Desconto (%)">
                  <Input name="punctual_discount_pct" inputMode="decimal" defaultValue={s.punctual_discount_pct ?? 5} className="max-w-32" />
                </Field>
              </ToggleSection>
              {admin && <SubmitButton size="md">Salvar descontos</SubmitButton>}
            </ActionForm>
          </Block>
        </div>
      )}

      {/* ===== 2 · Turmas / Profissionais ===== */}
      {tab === "turmas" && (
        <div className="space-y-3">
          <Block
            n="2.1"
            id="b-prof"
            title={isAula ? "Professores" : "Profissionais"}
            hint={explicitPros.length ? explicitPros.map((p) => p.name.split(" ")[0]).join(", ") : "falta escolher"}
            warn={!explicitPros.length}
            open={bloco === "prof" || !explicitPros.length}
          >
            {!explicitPros.length && (
              <div className="rounded-2xl border border-dashed border-warn/50 bg-warn-soft/40 p-4">
                <p className="font-semibold text-warn">{isAula ? "Quem dá esta aula?" : "Quem atende este serviço?"}</p>
                <p className="text-[14px] text-muted">
                  {isAula ? "Sem professor a turma não tem quem dê a aula nem quem receba a comissão." : "Marque quem atende: no link de agendamento só aparece quem faz o serviço."}
                </p>
              </div>
            )}
            <ActionForm action={saveServicePros} className="space-y-3">
              <input type="hidden" name="service_id" value={s.id} />
              <div className="flex flex-wrap gap-2">
                {(pros ?? []).map((p) => (
                  <label key={p.id} className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-[15px] font-medium has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                    <input type="checkbox" name="pro" value={p.id} defaultChecked={explicitPros.some((x) => x.id === p.id)} className="sr-only" />
                    <span className="size-2.5 rounded-full" style={{ background: proColor(p.color, p.id) }} /> {p.name}
                  </label>
                ))}
              </div>
              <p className="text-[13px] text-muted">
                {isAula ? "Quem entra aqui pode dar todas as turmas deste serviço." : "Os horários de cada um ficam em Página da clínica › horários de atendimento."}
                {" "}Também dá para marcar pela ficha da pessoa em Menu › Equipe.
              </p>
              {admin && <SubmitButton size="md">Salvar</SubmitButton>}
            </ActionForm>
            {!isAula && (
              <div className="flex flex-wrap gap-2">
                <Link href="/ajustes/agendamento-online" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-[14px] font-semibold text-accent">
                  Horários e agendamento online ›
                </Link>
                {!hasAvail && <Badge tone="warn">Sem horário de atendimento</Badge>}
                {!s.bookable && <Badge tone="warn">Fora do link</Badge>}
              </div>
            )}
          </Block>

          <Block n="2.2" title="Salas" hint={`${roomList.length} sala${roomList.length === 1 ? "" : "s"}`}>
            {roomList.length > 0 && (
              <Card className="divide-y divide-line overflow-hidden">
                {roomList.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 font-medium">
                      {r.name}
                      {r.capacity ? <span className="text-muted"> · {r.capacity} pessoas</span> : null}
                    </span>
                    {admin && (
                      <form action={archiveRoom}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmSubmit size="sm" variant="ghost" question={`Tirar a sala ${r.name}? As turmas dela ficam sem sala.`}>
                          Tirar
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                ))}
              </Card>
            )}
            {admin && (
              <ActionForm action={saveRoom} resetOnSuccess className="flex flex-wrap items-end gap-2 space-y-0!">
                <div className="min-w-40 flex-1">
                  <Field label="Nova sala">
                    <Input name="name" placeholder="Ex.: Sala 1" />
                  </Field>
                </div>
                <div className="w-28">
                  <Field label="Cabem">
                    <Input name="capacity" inputMode="numeric" placeholder="6" />
                  </Field>
                </div>
                <SubmitButton size="md" variant="secondary">
                  + Criar sala
                </SubmitButton>
              </ActionForm>
            )}
            <p className="text-[13px] text-muted">Com salas, a grade mostra o que está ocupado em cada uma e evita duas turmas na mesma sala ao mesmo tempo.</p>
          </Block>

          {isAula && (
            <Block n="2.3" id="b-grade" title="Grade da semana" hint={turmas.length ? `${turmas.length} turma${turmas.length === 1 ? "" : "s"}` : "nenhuma turma"} warn={!turmas.length} open={bloco === "grade" || !!sala || turmas.length === 0 || bloco === undefined}>
              <WeekGrid s={s} turmas={turmas} rooms={roomList} sala={sala} href={href} admin={admin} />
            </Block>
          )}
        </div>
      )}

      {/* ===== 3 · Regras ===== */}
      {tab === "regras" && (
        <ActionForm action={saveServiceRules} className="space-y-3">
          <input type="hidden" name="id" value={s.id} />
          <Block n="3.1" title="Evolução clínica" hint={s.requires_evolution ? "pede depois de cada atendimento" : "opcional"}>
            <Toggle name="requires_evolution" defaultChecked={s.requires_evolution} title="Pedir evolução depois de cada atendimento" desc="Aparece o selo “Evolução pendente” na agenda até o profissional escrever." />
          </Block>
          <Block n="3.2" id="b-faltas" title="Faltas e reposição" open hint={!s.rules_reviewed ? "revisar" : undefined} warn={!s.rules_reviewed}>
            {!s.rules_reviewed && (
              <p className="rounded-xl border border-warn/30 bg-warn-soft/60 px-4 py-3 text-[15px] text-warn">
                Nunca revisada: está usando o padrão (aviso {notice} h, falta desconta a aula, desmarcou no prazo ganha reposição). <b>Confira e salve</b> para {s.name} ter a regra da clínica.
              </p>
            )}
            <details open className="group rounded-2xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 [&::-webkit-details-marker]:hidden">
                <span className="text-[13px] font-bold text-muted">3.2.1</span> <span className="font-semibold">Antes da aula</span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <label className="flex flex-wrap items-center gap-2 text-[15px]">
                  Avisou até
                  <span className="inline-block w-20"><Input name="cancel_notice_hours" inputMode="numeric" defaultValue={s.cancel_notice_hours ?? ""} placeholder={String(settings?.cancel_notice_hours ?? 12)} className="text-center" /></span>
                  h antes = <b>falta com aviso</b>
                </label>
                <p className="text-[13px] text-muted">Vazio = regra geral da clínica ({settings?.cancel_notice_hours ?? 12} h).</p>
                <Toggle name="early_eve" defaultChecked={s.early_eve} title="Aula cedo: avisar na véspera" desc="Para aulas antes das 10h, o prazo é até as 20h do dia anterior." />
                <Toggle name="self_cancel" defaultChecked={s.self_cancel} title={isAula ? "O aluno desmarca sozinho" : "O paciente desmarca sozinho"} desc="Pelo app do aluno, dentro do prazo." />
                <ToggleSection name="self_reschedule" defaultChecked={s.self_reschedule} title={isAula ? "O aluno remarca sozinho pelo link" : "O paciente remarca sozinho pelo link"} desc="Troca o horário sem falar com a recepção.">
                  <label className="flex flex-wrap items-center gap-2 text-[15px]">
                    No máximo
                    <span className="inline-block w-20"><Input name="reschedule_max_month" inputMode="numeric" defaultValue={s.reschedule_max_month} className="text-center" /></span>
                    por mês <span className="text-muted">(0 = sem limite)</span>
                  </label>
                  <p className="mt-3 mb-2 font-semibold">Tentou fora do prazo</p>
                  <ChoiceCards
                    name="late_reschedule"
                    value={s.late_reschedule}
                    options={[
                      { v: "falta", t: "Vira falta", d: "não remarca; se faltar, conta falta" },
                      { v: "bloqueia", t: "Não remarca", d: "fala com a recepção" },
                      { v: "deixa", t: "Deixa remarcar", d: "troca mesmo fora do prazo" },
                    ]}
                  />
                </ToggleSection>
              </div>
            </details>
            <details open className="group rounded-2xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 [&::-webkit-details-marker]:hidden">
                <span className="text-[13px] font-bold text-muted">3.2.2</span> <span className="font-semibold">Se faltou</span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <p className="font-semibold">Sem aviso</p>
                <ChoiceCards
                  name="noshow_rule"
                  value={s.noshow_rule}
                  options={[
                    { v: "perde_comissao", t: "Perde + paga comissão", d: "desconta a aula e o profissional recebe" },
                    { v: "so_falta", t: "Só marca falta", d: "não desconta a aula, sem comissão" },
                    { v: "perde_sem_comissao", t: "Perde, sem comissão", d: "desconta a aula, profissional não recebe" },
                  ]}
                />
                <p className="pt-2 font-semibold">Com aviso (dentro do prazo)</p>
                <ChoiceCards
                  name="notice_rule"
                  value={s.notice_rule}
                  options={[
                    { v: "credito", t: "Vira crédito", d: "para repor em outra aula" },
                    { v: "perde", t: "Perde a aula", d: "avisar não muda nada" },
                    { v: "nao_perde", t: "Não perde", d: "só libera o horário, sem cobrar nem gerar crédito" },
                  ]}
                />
              </div>
            </details>
            <details className="group rounded-2xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 [&::-webkit-details-marker]:hidden">
                <span className="text-[13px] font-bold text-muted">3.2.3</span> <span className="font-semibold">Reposição</span>
                <span className="ml-auto text-[13px] text-muted">{s.notice_rule === "credito" ? `vale ${s.makeup_days ?? settings?.makeup_validity_days ?? 30} dias` : "sem reposição"}</span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <p className="text-[14px] text-muted">Vale quando “Com aviso” está em <b>Vira crédito</b>. A reposição é marcada numa aula com vaga (pela recepção ou pelo app do aluno).</p>
                <label className="flex flex-wrap items-center gap-2 text-[15px]">
                  Crédito vale
                  <span className="inline-block w-20"><Input name="makeup_days" inputMode="numeric" defaultValue={s.makeup_days ?? ""} placeholder={String(settings?.makeup_validity_days ?? 30)} className="text-center" /></span>
                  dias
                </label>
                <label className="flex flex-wrap items-center gap-2 text-[15px]">
                  No máximo
                  <span className="inline-block w-20"><Input name="makeup_max_month" inputMode="numeric" defaultValue={s.makeup_max_month} className="text-center" /></span>
                  reposições por mês <span className="text-muted">(0 = sem limite)</span>
                </label>
              </div>
            </details>
          </Block>
          {admin && (
            <div className="flex justify-end">
              <SubmitButton size="lg" pendingText="Salvando…">
                Salvar regras
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      )}

      {/* ===== 4 · Alunos ===== */}
      {tab === "alunos" && (
        <div className="space-y-3">
          {students.length === 0 ? (
            <Card className="p-5 text-[15px] text-muted">
              Ninguém em {s.name} ainda. {isAula ? "Matricule pelo botão + em Turmas › Nova matrícula." : "Venda um pacote pela ficha do paciente."}
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {students.map((p) => (
                <Link key={p.id} href={`/pacientes/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">{p.name.trim()[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-[13px] text-muted">{p.how}</span>
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Rodapé */}
      {admin && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <span className="mr-auto text-[14px] text-muted">Este serviço</span>
          <form action={duplicateService}>
            <input type="hidden" name="id" value={s.id} />
            <SubmitButton size="md" variant="secondary" pendingText="Duplicando…">
              Duplicar
            </SubmitButton>
          </form>
          <form action={toggleActive}>
            <input type="hidden" name="table" value="services" />
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="active" value={String(!s.active)} />
            <SubmitButton size="md" variant="secondary" pendingText="Aguarde…">
              {s.active ? "Arquivar" : "Reativar"}
            </SubmitButton>
          </form>
          <form action={deleteService}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmSubmit size="md" variant="secondary" className="text-bad!" question={`Excluir ${s.name}? Se já tiver aulas ou vendas, ele será só arquivado (o histórico fica guardado).`}>
              Excluir
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}

function PackFields({ p, serviceId }: { p?: Product; serviceId: string }) {
  return (
    <ActionForm action={saveProduct} resetOnSuccess={!p} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="kind" value="pacote" />
      <input type="hidden" name="service_id" value={serviceId} />
      <Field label="Nome">
        <Input name="name" required defaultValue={p?.name} placeholder="Ex.: Pacote 10 aulas" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantas">
          <Input name="sessions" inputMode="numeric" required defaultValue={p?.sessions ?? ""} placeholder="10" />
        </Field>
        <Field label="Vale (dias)">
          <Input name="validity_days" inputMode="numeric" defaultValue={p?.validity_days ?? ""} placeholder="90" />
        </Field>
        <Field label="Valor total">
          <Input name="price" inputMode="decimal" required defaultValue={money(p?.price_cents)} placeholder="0,00" />
        </Field>
      </div>
      <SubmitButton size="md">{p ? "Salvar" : "Criar pacote"}</SubmitButton>
    </ActionForm>
  );
}

/** Grade Seg–Sáb × horários: turma existente = cartão; vazio = toque para criar a turma ali. */
function WeekGrid({
  s,
  turmas,
  rooms,
  sala,
  href,
  admin,
}: {
  s: FullService;
  turmas: { id: string; name: string | null; weekday: number; start_time: string; duration_min: number; capacity: number; room_id: string | null; enrollments: { ends_on: string | null }[] }[];
  rooms: { id: string; name: string }[];
  sala?: string;
  href: (o: { aba?: string; b?: string; sala?: string }) => string;
  admin: boolean;
}) {
  const today = todayISO();
  const step = s.start_mode === "sequencia" ? s.duration_min : 30;
  const shown = turmas.filter((t) => !sala || t.room_id === sala);
  const starts = turmas.map((t) => toMin(t.start_time));
  const ends = turmas.map((t) => toMin(t.start_time) + t.duration_min);
  const from = Math.min(7 * 60, ...starts);
  const to = Math.max(20 * 60, ...ends);
  const rows: number[] = [];
  for (let m = from - (from % 30); m + s.duration_min <= to + 1; m += step) rows.push(m);
  const days = [1, 2, 3, 4, 5, 6, ...(turmas.some((t) => t.weekday === 7) ? [7] : [])];
  const at = (d: number, m: number) => shown.find((t) => t.weekday === d && toMin(t.start_time) === m);
  const busy = (d: number, m: number) => shown.some((t) => t.weekday === d && toMin(t.start_time) < m + s.duration_min && toMin(t.start_time) + t.duration_min > m);
  return (
    <div className="space-y-3">
      <form action={setStartMode} className="rounded-2xl bg-bg p-3">
        <input type="hidden" name="id" value={s.id} />
        <p className="mb-2 font-semibold">Horários de início · aula de {s.duration_min} min</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: "sequencia", t: "Em sequência", d: "uma depois da outra" },
            { v: "meia", t: "Hora cheia e meia", d: ":00 e :30" },
          ].map((o) => (
            <button
              key={o.v}
              type="submit"
              name="start_mode"
              value={o.v}
              disabled={!admin}
              className={cx("rounded-xl border px-3 py-2 text-left", s.start_mode === o.v ? "border-ok bg-ok-soft" : "border-line bg-surface")}
            >
              <span className={cx("block font-semibold", s.start_mode === o.v && "text-ok")}>{o.t}</span>
              <span className="block text-[13px] text-muted">{o.d}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Uma turma de {s.duration_min} min ocupa a sala enquanto dura. Horário fora disso (ex.: 06:10): “Outro horário”, abaixo da grade.</p>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link href={href({ b: "grade" })} className={cx("inline-flex min-h-10 items-center rounded-full border px-4 text-[14px] font-semibold", !sala ? "border-ok bg-ok-soft text-ok" : "border-line bg-surface text-muted")}>
          Todas
        </Link>
        {rooms.map((r) => (
          <Link key={r.id} href={href({ b: "grade", sala: r.id })} className={cx("inline-flex min-h-10 items-center rounded-full border px-4 text-[14px] font-semibold", sala === r.id ? "border-ok bg-ok-soft text-ok" : "border-line bg-surface text-muted")}>
            {r.name} · {turmas.filter((t) => t.room_id === r.id).length}
          </Link>
        ))}
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="grid min-w-[30rem] gap-1" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0,1fr))` }}>
          <span />
          {days.map((d) => (
            <span key={d} className="pb-1 text-center text-[13px] font-semibold text-muted capitalize">
              {WEEKDAYS_SHORT[d]}
            </span>
          ))}
          {rows.map((m) => (
            <Row key={m} m={m} days={days} at={at} busy={busy} s={s} sala={sala} admin={admin} today={today} />
          ))}
        </div>
      </div>
      {admin && (
        <Link href={`/horarios/novo?servico=${s.id}${sala ? `&sala=${sala}` : ""}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[15px] font-semibold text-accent hover:bg-hover">
          <Plus size={16} /> Outro horário
        </Link>
      )}
      {!rooms.length && (
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <AlertTriangle size={14} /> Sem salas cadastradas: a grade mostra todas as turmas juntas.
        </p>
      )}
    </div>
  );
}

function Row({
  m,
  days,
  at,
  busy,
  s,
  sala,
  admin,
  today,
}: {
  m: number;
  days: number[];
  at: (d: number, m: number) => { id: string; capacity: number; enrollments: { ends_on: string | null }[] } | undefined;
  busy: (d: number, m: number) => boolean;
  s: FullService;
  sala?: string;
  admin: boolean;
  today: string;
}) {
  return (
    <>
      <span className="flex items-center text-[12px] font-semibold text-muted tabular-nums">{hhmm(m)}</span>
      {days.map((d) => {
        const t = at(d, m);
        if (t) {
          const n = t.enrollments.filter((e) => !e.ends_on || e.ends_on >= today).length;
          return (
            <Link key={d} href={`/horarios/${t.id}`} className="grid h-11 place-items-center rounded-lg bg-chart-out/20 text-[12px] font-bold text-[#a85a17] tabular-nums">
              {n}/{t.capacity}
            </Link>
          );
        }
        if (busy(d, m)) return <span key={d} className="h-11 rounded-lg bg-[repeating-linear-gradient(45deg,var(--color-hover),var(--color-hover)_4px,transparent_4px,transparent_8px)]" />;
        return admin ? (
          <Link
            key={d}
            href={`/horarios/novo?servico=${s.id}&dia=${d}&h=${hhmm(m)}${sala ? `&sala=${sala}` : ""}`}
            aria-label={`Criar turma ${WEEKDAYS_SHORT[d]} ${hhmm(m)}`}
            className="h-11 rounded-lg border border-line bg-surface hover:border-accent hover:bg-accent-soft"
          />
        ) : (
          <span key={d} className="h-11 rounded-lg border border-line bg-surface" />
        );
      })}
    </>
  );
}
