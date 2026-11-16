import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  Cake,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HandCoins,
  Lock,
  NotebookPen,
  Package,
  Plus,
  Repeat,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonClass, Card, cx, EmptyState, LinkButton } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { WeekGrid, type GridAppt } from "./week-grid";
import { ProGrid, type ProGridAppt, type ProGridBlock } from "./pro-grid";
import { removeBlock } from "./actions";
import { WaSendButton } from "@/components/wa-send";
import { firstName } from "@/lib/messages";
import { proColor } from "@/lib/colors";
import { isActiveAttendee } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, dayRange, formatDayLong, formatMoney, formatTime, isoWeekday, todayISO, TZ, WEEKDAYS_SHORT } from "@/lib/format";

export const metadata = { title: "Hoje" };

type Attendee = {
  id: string;
  patient_id: string;
  status: string;
  is_makeup: boolean;
  booked_online: boolean;
  patients: { name: string; access_via: string | null } | null;
};
type Appt = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  series_id: string | null;
  services: { name: string; kind: string } | null;
  professionals: { id: string; name: string; color: string | null } | null;
  appointment_attendees: Attendee[];
};

const DOT: Record<string, string> = { agendado: "bg-faint", confirmado: "bg-info", presente: "bg-ok", falta: "bg-bad" };
const isAula = (a: { capacity: number; services: { kind: string } | null }) => a.services?.kind === "turma" || a.capacity > 1;

type Sp = { d?: string; bemvindo?: string; v?: string; t?: string; pro?: string; f?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayISO();
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const view = sp.v === "semana" ? "semana" : sp.v === "pro" ? "pro" : "dia";
  const tipo = sp.t === "consultas" || sp.t === "aulas" ? sp.t : "tudo";
  const filter = ["chamada", "evolucao", "confirmar", "risco"].includes(sp.f ?? "") ? sp.f! : null;
  const weekStart = addDaysISO(day, 1 - isoWeekday(day));
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const supabase = await createClient();

  // Mantém sempre as próximas 8 semanas das turmas lançadas
  if (ctx.canManageAgenda) await supabase.rpc("ensure_agenda", { p_clinic: ctx.clinicId });

  const { from, to } = dayRange(day);
  const weekRange = { from: dayRange(week[0]).from, to: dayRange(week[6]).to };
  const [{ data: appts }, { data: weekAppts }, { data: prosData }, { data: blocksData }, { count: patientCount }, { count: seriesCount }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, capacity, status, series_id, services(name, kind), professionals(id, name, color), appointment_attendees(id, patient_id, status, is_makeup, booked_online, patients(name, access_via))",
      )
      .eq("clinic_id", ctx.clinicId)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, capacity, services(name, kind), professionals(id, name, color), appointment_attendees(status, patients(name))")
      .eq("clinic_id", ctx.clinicId)
      .eq("status", "agendado")
      .gte("starts_at", weekRange.from)
      .lt("starts_at", weekRange.to)
      .order("starts_at"),
    supabase.from("professionals").select("id, name, color").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase
      .from("time_blocks")
      .select("id, professional_id, starts_at, ends_at, reason")
      .eq("clinic_id", ctx.clinicId)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at"),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId),
    supabase.from("recurring_series").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId),
  ]);
  const pros = prosData ?? [];
  const proFilter = pros.find((p) => p.id === sp.pro)?.id ?? null;
  const blocks = ((blocksData ?? []) as ProGridBlock[]).filter((b) => !proFilter || !b.professional_id || b.professional_id === proFilter);

  const perDay = new Map<string, number>();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  (weekAppts ?? []).forEach((a) => {
    const k = dayFmt.format(new Date(a.starts_at));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  });

  const all = (appts ?? []) as unknown as Appt[];
  const canceled = all.filter((a) => a.status === "cancelado");
  const scoped = all
    .filter((a) => a.status === "agendado")
    .filter((a) => !proFilter || a.professionals?.id === proFilter)
    .filter((a) => tipo === "tudo" || (tipo === "aulas" ? isAula(a) : !isAula(a)));

  // Pendências de cada sessão
  const now = Date.now();
  const { data: evoData } =
    ctx.canSeeClinical && scoped.length
      ? await supabase.from("session_evolutions").select("appointment_id").in("appointment_id", scoped.map((a) => a.id))
      : { data: [] as { appointment_id: string }[] };
  const evolved = new Set((evoData ?? []).map((e) => e.appointment_id));
  const canEvolve = (a: Appt) => ctx.isAdmin || (!!ctx.professionalId && a.professionals?.id === ctx.professionalId);
  const flags = new Map<string, { chamada: boolean; evolucao: boolean; risco: boolean; confirmar: number }>();
  for (const a of scoped) {
    const ended = Date.parse(a.ends_at) < now;
    const startsIn = Date.parse(a.starts_at) - now;
    const waiting = a.appointment_attendees.filter((t) => t.status === "agendado").length;
    flags.set(a.id, {
      chamada: ended && a.appointment_attendees.some((t) => t.status === "agendado" || t.status === "confirmado"),
      evolucao: ended && ctx.canSeeClinical && canEvolve(a) && !evolved.has(a.id) && a.appointment_attendees.some((t) => t.status === "presente"),
      risco: startsIn > 0 && startsIn <= 2 * 3600e3 && waiting > 0,
      confirmar: startsIn > 0 ? waiting : 0,
    });
  }
  const visible = scoped.filter((a) => {
    const f = flags.get(a.id)!;
    if (filter === "chamada") return f.chamada;
    if (filter === "evolucao") return f.evolucao;
    if (filter === "risco") return f.risco;
    if (filter === "confirmar") return f.confirmar > 0;
    return true;
  });

  // Resumo do dia
  const consultas = scoped.filter((a) => !isAula(a));
  const aulas = scoped.filter(isAula);
  const done = consultas.filter((a) => a.appointment_attendees.some((t) => t.status === "presente")).length;
  const toConfirm = scoped.reduce((n, a) => n + flags.get(a.id)!.confirmar, 0);
  const atRisk = scoped.filter((a) => flags.get(a.id)!.risco).length;
  const pendingCalls = scoped.filter((a) => flags.get(a.id)!.chamada).length;
  const pendingEvos = scoped.filter((a) => flags.get(a.id)!.evolucao).length;
  const aulaPeople = aulas.reduce((n, a) => n + a.appointment_attendees.filter((t) => isActiveAttendee(t.status)).length, 0);
  const aulaCap = aulas.reduce((n, a) => n + a.capacity, 0);

  const isTodayView = day === today;
  let dueToday = 0;
  let birthdays: { id: string; name: string; phone: string | null }[] = [];
  if (isTodayView && ctx.role !== "profissional") {
    const [{ data: due }, { data: bdays }] = await Promise.all([
      supabase.from("transactions").select("amount_cents").eq("clinic_id", ctx.clinicId).eq("type", "receita").is("paid_on", null).lte("due_date", today),
      supabase.from("patients").select("id, name, phone, birth_date").eq("clinic_id", ctx.clinicId).eq("active", true).not("birth_date", "is", null).limit(5000),
    ]);
    dueToday = (due ?? []).reduce((acc, t) => acc + t.amount_cents, 0);
    birthdays = (bdays ?? []).filter((p) => p.birth_date!.slice(5) === today.slice(5));
  }
  const { data: endingData } =
    ctx.role !== "profissional"
      ? await supabase.from("packages_ending").select("patient_id, sessions_left").eq("clinic_id", ctx.clinicId)
      : { data: [] as { patient_id: string | null; sessions_left: number | null }[] };
  const endingOf = new Map((endingData ?? []).map((e) => [e.patient_id, e.sessions_left]));
  const endingLabel = (left: number | null | undefined) =>
    left != null && left <= 0 ? "pacote acabou" : left != null ? `pacote: falta${left === 1 ? "" : "m"} ${left}` : "pacote vencendo";
  const showWelcome = ctx.canManageAgenda && (sp.bemvindo || (!patientCount && !seriesCount));

  const href = (patch: Partial<Sp>) => {
    const q = new URLSearchParams();
    const m = { d: day === today ? undefined : day, v: view === "dia" ? undefined : view, t: tipo === "tudo" ? undefined : tipo, pro: proFilter ?? undefined, f: filter ?? undefined, ...patch };
    Object.entries(m).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return `/agenda${s ? `?${s}` : ""}`;
  };

  const actions: { key: string; icon: LucideIcon; label: string; n: number | string; href: string; tone?: "warn" | "bad" }[] = [
    { key: "chamada", icon: ClipboardCheck, label: "Chamadas pendentes", n: pendingCalls, href: href({ f: "chamada", v: undefined }), tone: "warn" as const },
    ...(ctx.canSeeClinical ? [{ key: "evolucao", icon: NotebookPen, label: "Evoluções pendentes", n: pendingEvos, href: href({ f: "evolucao", v: undefined }), tone: "warn" as const }] : []),
    { key: "risco", icon: AlertTriangle, label: "Em risco (sem confirmar, < 2h)", n: atRisk, href: href({ f: "risco", v: undefined }), tone: "bad" as const },
    ...(ctx.role !== "profissional"
      ? [
          { key: "renov", icon: Package, label: "Pacotes acabando", n: endingOf.size, href: "/whatsapp?aba=renovacoes" },
          { key: "receber", icon: HandCoins, label: "A receber até hoje", n: dueToday ? formatMoney(dueToday) : 0, href: "/financeiro/cobrancas" },
          { key: "lembretes", icon: BellRing, label: "Lembretes de amanhã", n: "Enviar", href: "/whatsapp?aba=lembretes" },
        ]
      : []),
  ].filter((a) => a.n !== 0);

  const summary = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <p className="col-span-2 flex items-center gap-2 text-[13px] font-semibold text-muted">
          <span className="size-2.5 rounded-full bg-chart-in" /> Consultas
        </p>
        <Tile n={consultas.length} label="sessões" />
        <Tile n={done} label="realizadas" sub={consultas.length ? `de ${consultas.length}` : undefined} />
        <Tile n={toConfirm} label="a confirmar" sub="sem resposta" href={toConfirm ? href({ f: "confirmar", v: undefined }) : undefined} />
        <Tile n={atRisk} label="em risco" sub="< 2h sem confirmar" tone={atRisk ? "bad" : undefined} href={atRisk ? href({ f: "risco", v: undefined }) : undefined} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <p className="col-span-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
          <span className="size-2.5 rounded-full bg-chart-out" /> Aulas
        </p>
        <Tile n={aulas.length} label="aulas" />
        <Tile n={aulaPeople} label="alunos" />
        <Tile n={aulaCap ? `${Math.round((aulaPeople / aulaCap) * 100)}%` : "—"} label="ocupação" sub={aulaCap ? `${aulaPeople}/${aulaCap} vagas` : undefined} />
      </div>
      {actions.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-muted">{isTodayView ? "Para fazer hoje" : "Para fazer"}</p>
          <div className="space-y-2">
            {actions.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className={cx(
                  "flex min-h-12 items-center gap-3 rounded-xl border bg-surface px-3 py-2 transition-colors hover:bg-hover",
                  filter === a.key ? "border-accent ring-1 ring-accent" : "border-line",
                )}
              >
                <span
                  className={cx(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    a.tone === "bad" ? "bg-bad-soft text-bad" : a.tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent",
                  )}
                >
                  <a.icon size={16} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-medium">{a.label}</span>
                <span className="text-sm font-semibold tabular-nums">{a.n}</span>
                <ChevronRight size={16} className="text-faint" />
              </Link>
            ))}
          </div>
        </div>
      )}
      {isTodayView && birthdays.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Cake size={14} /> Aniversário hoje
          </p>
          <Card className="divide-y divide-line overflow-hidden">
            {birthdays.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2">
                <Link href={`/pacientes/${b.id}`} className="min-w-0 flex-1 truncate text-[15px] font-medium hover:underline">
                  {b.name}
                </Link>
                {b.phone && (
                  <WaSendButton
                    compact
                    phone={b.phone}
                    kind="outro"
                    patientId={b.id}
                    label="Parabéns"
                    body={`Feliz aniversário, ${firstName(b.name)}! 🎉 Toda a equipe da ${ctx.clinicName} deseja um dia lindo e muita saúde!`}
                  />
                )}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );

  const chip = (on: boolean) =>
    cx(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
      on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
    );

  return (
    <div data-wide>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            {view === "semana" ? "Semana" : isTodayView ? "Hoje" : formatDayLong(day).split(",")[0]}
          </h1>
          <p className="text-[15px] text-muted">
            {view === "semana"
              ? `${formatDayLong(week[0]).split(", ")[1]} a ${formatDayLong(week[6]).split(", ")[1]}`
              : isTodayView
                ? formatDayLong(day)
                : formatDayLong(day).split(", ")[1]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-hover p-1" role="tablist" aria-label="Visualização">
            {(
              [
                { v: "dia", label: "Dia" },
                { v: "pro", label: "Por profissional" },
                { v: "semana", label: "Semana" },
              ] as const
            ).map((o) => (
              <Link key={o.v} role="tab" aria-selected={view === o.v} href={href({ v: o.v === "dia" ? undefined : o.v, f: undefined })} className={chip(view === o.v)}>
                {o.v === "pro" ? (
                  <>
                    <span className="sm:hidden">Profissionais</span>
                    <span className="hidden sm:inline">Por profissional</span>
                  </>
                ) : (
                  o.label
                )}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <div className="flex shrink-0 rounded-xl bg-hover p-1" aria-label="Tipo">
          {(
            [
              { t: "tudo", label: "Tudo", dot: "" },
              { t: "consultas", label: "Consultas", dot: "bg-chart-in" },
              { t: "aulas", label: "Aulas", dot: "bg-chart-out" },
            ] as const
          ).map((o) => (
            <Link key={o.t} href={href({ t: o.t === "tudo" ? undefined : o.t })} aria-current={tipo === o.t ? "true" : undefined} className={chip(tipo === o.t)}>
              {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />} {o.label}
            </Link>
          ))}
        </div>
        {pros.length > 1 && (
          <div className="flex shrink-0 rounded-xl bg-hover p-1" aria-label="Profissional">
            <Link href={href({ pro: undefined })} className={chip(!proFilter)}>
              Todos
            </Link>
            {pros.map((p) => (
              <Link key={p.id} href={href({ pro: p.id })} className={chip(proFilter === p.id)}>
                <span className="size-2 rounded-full" style={{ background: proColor(p.color, p.id) }} /> {p.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {showWelcome && (
        <Card className="mb-6 p-5 sm:p-6">
          <p className="text-[17px] font-semibold">Bem-vindo(a)! Vamos deixar sua agenda pronta em 3 passos:</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/pacientes", icon: Users, title: "1. Pacientes", text: "Cadastre ou importe da planilha.", done: !!patientCount },
              { href: "/horarios/novo", icon: Repeat, title: "2. Turmas", text: "Ex.: Pilates ter/qui 7h.", done: !!seriesCount },
              { href: "/agenda", icon: CalendarDays, title: "3. Hoje", text: "Pronto! Marque presença aqui.", done: false },
            ].map((s) => (
              <li key={s.title}>
                <Link
                  href={s.href}
                  className={cx(
                    "flex h-full items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-hover",
                    s.done ? "border-ok/30 bg-ok-soft/50" : "border-line",
                  )}
                >
                  <s.icon size={20} className={s.done ? "text-ok" : "text-accent"} />
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="text-sm text-muted">{s.done ? "Feito ✓" : s.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {view === "semana" ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link href={href({ d: addDaysISO(day, -7) })} className={buttonClass("ghost", "md")} aria-label="Semana anterior">
              <ChevronLeft size={20} /> <span className="hidden sm:inline">Anterior</span>
            </Link>
            {!week.includes(today) ? (
              <Link href={href({ d: undefined })} className="text-sm font-medium text-accent hover:underline">
                Voltar para esta semana
              </Link>
            ) : (
              <span className="text-sm text-muted">Toque numa sessão para abrir</span>
            )}
            <Link href={href({ d: addDaysISO(day, 7) })} className={buttonClass("ghost", "md")} aria-label="Próxima semana">
              <span className="hidden sm:inline">Próxima</span> <ChevronRight size={20} />
            </Link>
          </div>
          <WeekGrid
            week={week}
            today={today}
            appts={((weekAppts ?? []) as unknown as GridAppt[])
              .filter((a) => !proFilter || a.professionals?.id === proFilter)
              .filter((a) => tipo === "tudo" || (tipo === "aulas" ? isAula(a) : !isAula(a)))}
          />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            {/* Atalhos */}
            {ctx.canManageAgenda ? (
              <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                <Link href={`/agenda/nova?d=${day}`} className="col-span-3 flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-white transition-colors hover:bg-accent-strong sm:col-span-1">
                  <Plus size={22} />
                  <span>
                    <span className="block font-semibold">Agendar</span>
                    <span className="block text-[12px] text-white/80">Consulta ou sessão</span>
                  </span>
                </Link>
                {[
                  { href: `/agenda/bloquear?d=${day}`, icon: Lock, label: "Bloquear horário", short: "Bloquear" },
                  { href: "/agenda/vagas?motivo=experimental", icon: Sparkles, label: "Aula experimental", short: "Experimental" },
                  { href: "/agenda/vagas?motivo=reposicao", icon: RefreshCcw, label: "Repor aula", short: "Repor aula" },
                ].map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-2 py-2 text-[13px] font-medium transition-colors hover:bg-hover sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-sm"
                  >
                    <q.icon size={18} className="shrink-0 text-accent" />
                    <span className="sm:hidden">{q.short}</span>
                    <span className="hidden sm:inline">{q.label}</span>
                  </Link>
                ))}
              </div>
            ) : (
              ctx.professionalId && (
                <div className="mb-5">
                  <LinkButton href={`/agenda/bloquear?d=${day}`} variant="secondary">
                    <Lock size={18} /> Bloquear meu horário
                  </LinkButton>
                </div>
              )
            )}

            {/* Resumo no celular */}
            <details className="mb-5 rounded-2xl border border-line bg-surface lg:hidden" open={pendingCalls + pendingEvos + atRisk > 0}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                Resumo do dia
                <span className="text-sm font-normal text-muted">
                  {scoped.length} {scoped.length === 1 ? "sessão" : "sessões"}
                  {actions.length ? ` · ${actions.length} para fazer` : ""}
                </span>
              </summary>
              <div className="border-t border-line p-4">{summary}</div>
            </details>

            {view === "pro" ? (
              <>
                <DayNav day={day} today={today} week={week} perDay={perDay} href={href} />
                {pros.length === 0 ? (
                  <EmptyState title="Nenhum profissional ativo" text="Cadastre os profissionais em Minha clínica." />
                ) : (
                  <ProGrid
                    day={day}
                    pros={pros.filter((p) => !proFilter || p.id === proFilter)}
                    appts={visible.map((a) => ({ ...a, flag: flags.get(a.id)!.evolucao ? "Evol." : flags.get(a.id)!.chamada ? "Chamada" : null })) as ProGridAppt[]}
                    blocks={blocks}
                    canBook={ctx.canManageAgenda}
                  />
                )}
              </>
            ) : (
              <>
                <DayNav day={day} today={today} week={week} perDay={perDay} href={href} />
                {filter && (
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2.5 text-[15px]">
                    <span>
                      Mostrando: <strong>{actions.find((a) => a.key === filter)?.label ?? (filter === "confirmar" ? "A confirmar" : "")}</strong>
                    </span>
                    <Link href={href({ f: undefined })} className="font-medium text-accent hover:underline">
                      Ver tudo
                    </Link>
                  </div>
                )}

                {blocks.length > 0 && !filter && (
                  <ul className="mb-3 space-y-2">
                    {blocks.map((b) => (
                      <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-hover/60 px-4 py-3">
                        <Lock size={18} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 text-[15px]">
                          <span className="font-medium">
                            {formatTime(b.starts_at)}–{formatTime(b.ends_at)} · {b.reason || "Bloqueado"}
                          </span>
                          <span className="block text-sm text-muted">
                            {b.professional_id ? pros.find((p) => p.id === b.professional_id)?.name : "Clínica toda"}
                          </span>
                        </span>
                        {(ctx.canManageAgenda || b.professional_id === ctx.professionalId) && (
                          <form action={removeBlock}>
                            <input type="hidden" name="id" value={b.id} />
                            <ConfirmSubmit question="Tirar este bloqueio? O horário volta a ficar livre." variant="ghost" size="sm">
                              Desbloquear
                            </ConfirmSubmit>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {visible.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={22} />}
                    title={filter ? "Nada pendente aqui" : "Dia livre"}
                    text={filter ? "Tudo em dia. 👏" : ctx.canManageAgenda ? "Nenhuma sessão neste dia." : "Você não tem sessões neste dia."}
                    action={
                      !filter &&
                      ctx.canManageAgenda && (
                        <LinkButton href={`/agenda/nova?d=${day}`} variant="secondary">
                          <Plus size={18} /> Agendar
                        </LinkButton>
                      )
                    }
                  />
                ) : (
                  <ul className="space-y-3">
                    {visible.map((a) => {
                      const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                      const aula = isAula(a);
                      const f = flags.get(a.id)!;
                      const past = Date.parse(a.ends_at) < now;
                      return (
                        <li key={a.id}>
                          <Link href={`/agenda/${a.id}`} className="group block">
                            <Card className={cx("flex gap-4 p-4 transition-colors group-hover:border-faint sm:p-5", past && !f.chamada && !f.evolucao && "opacity-75")}>
                              <div className="w-14 shrink-0 pt-0.5">
                                <p className="text-[17px] font-semibold tabular-nums">{formatTime(a.starts_at)}</p>
                                <p className="text-[13px] text-muted tabular-nums">{formatTime(a.ends_at)}</p>
                              </div>
                              <div className="min-w-0 flex-1 border-l-[3px] pl-4" style={{ borderLeftColor: proColor(a.professionals?.color, a.professionals?.id) }}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="flex items-center gap-2 truncate font-semibold">
                                      <span className={cx("size-2 shrink-0 rounded-full", aula ? "bg-chart-out" : "bg-chart-in")} aria-label={aula ? "Aula" : "Consulta"} />
                                      {a.services?.name}
                                    </p>
                                    <p className="truncate text-sm text-muted">{a.professionals?.name}</p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {f.risco && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[12px] font-semibold text-bad">Em risco</span>}
                                    {f.chamada && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">Chamada pendente</span>}
                                    {f.evolucao && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">Evolução pendente</span>}
                                    {aula && (
                                      <span
                                        className={cx(
                                          "rounded-full px-2 py-0.5 text-[13px] font-medium tabular-nums",
                                          people.length >= a.capacity ? "bg-warn-soft text-warn" : "bg-hover text-muted",
                                        )}
                                      >
                                        {people.length}/{a.capacity}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {people.length > 0 ? (
                                  <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                                    {people.map((t) => (
                                      <li key={t.id} className="flex items-center gap-1.5 text-[15px]">
                                        <span className={cx("size-2 rounded-full", DOT[t.status] ?? "bg-faint")} aria-hidden />
                                        {t.patients?.name}
                                        {t.is_makeup && <span className="text-[12px] text-muted">(reposição)</span>}
                                        {t.booked_online && <span className="rounded-full bg-info-soft px-1.5 text-[11px] font-medium text-info">online</span>}
                                        {t.patients?.access_via && (
                                          <span className="rounded-full bg-info-soft px-1.5 text-[11px] font-medium text-info">
                                            {t.patients.access_via === "wellhub" ? "Wellhub" : "TotalPass"}
                                          </span>
                                        )}
                                        {endingOf.has(t.patient_id) && (
                                          <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn">{endingLabel(endingOf.get(t.patient_id))}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-2.5 text-[15px] text-faint">{aula ? "Ninguém nesta aula ainda" : "Sem paciente"}</p>
                                )}
                              </div>
                            </Card>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {visible.length > 0 && (
                  <p className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted">
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-faint" /> Agendado</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" /> Confirmado</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> Veio</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" /> Faltou</span>
                  </p>
                )}

                {canceled.length > 0 && !filter && (
                  <details className="mt-6 text-sm text-muted">
                    <summary className="cursor-pointer">{canceled.length} sessão(ões) cancelada(s) neste dia</summary>
                    <ul className="mt-2 space-y-1">
                      {canceled.map((a) => (
                        <li key={a.id}>
                          <Link href={`/agenda/${a.id}`} className="hover:underline">
                            {formatTime(a.starts_at)} · {a.services?.name} · {a.professionals?.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>

          {/* Resumo no computador */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-line bg-surface p-4">
              <p className="mb-4 text-[13px] font-semibold tracking-wide text-muted uppercase">
                Resumo · {isTodayView ? "hoje" : formatDayLong(day).split(", ")[1]}
              </p>
              {summary}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Tile({ n, label, sub, tone, href }: { n: number | string; label: string; sub?: string; tone?: "bad"; href?: string }) {
  const body = (
    <>
      <p className={cx("text-[22px] leading-none font-semibold tabular-nums", tone === "bad" && "text-bad")}>{n}</p>
      <p className="mt-1 text-[13px] font-medium">{label}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </>
  );
  const cls = cx("rounded-xl border px-3 py-2.5", tone === "bad" ? "border-bad/20 bg-bad-soft/60" : "border-line bg-bg/50");
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-faint")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function DayNav({
  day,
  today,
  week,
  perDay,
  href,
}: {
  day: string;
  today: string;
  week: string[];
  perDay: Map<string, number>;
  href: (patch: Partial<Sp>) => string;
}) {
  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <Link href={href({ d: addDaysISO(day, -7) })} className={buttonClass("ghost", "md")} aria-label="Semana anterior">
          <ChevronLeft size={20} />
        </Link>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const sel = d === day;
            const n = perDay.get(d) ?? 0;
            return (
              <Link
                key={d}
                href={href({ d: d === today ? undefined : d, f: undefined })}
                aria-current={sel ? "date" : undefined}
                className={cx(
                  "flex flex-col items-center rounded-xl py-2 transition-colors",
                  sel ? "bg-accent text-white" : "hover:bg-hover",
                  !sel && d === today && "text-accent",
                )}
              >
                <span className={cx("text-[12px] capitalize", sel ? "text-white/80" : "text-muted")}>{WEEKDAYS_SHORT[isoWeekday(d)]}</span>
                <span className="text-[17px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
                <span className={cx("mt-0.5 h-1.5 w-1.5 rounded-full", n ? (sel ? "bg-white" : "bg-accent") : "bg-transparent")} />
              </Link>
            );
          })}
        </div>
        <Link href={href({ d: addDaysISO(day, 7) })} className={buttonClass("ghost", "md")} aria-label="Próxima semana">
          <ChevronRight size={20} />
        </Link>
      </div>
      {day !== today && (
        <div className="-mt-3 mb-5 text-center">
          <Link href={href({ d: undefined, f: undefined })} className="text-sm font-medium text-accent hover:underline">
            Voltar para hoje
          </Link>
        </div>
      )}
    </>
  );
}
