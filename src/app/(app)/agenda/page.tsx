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
  RefreshCcw,
  SlidersHorizontal,
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
import { FirstSteps } from "@/components/first-steps";
import { firstName } from "@/lib/messages";
import { proColor, textOn } from "@/lib/colors";
import { isActiveAttendee } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { AppointmentDetail } from "./[id]/detail";
import { AgendaFab } from "./fab";
import { MobileApptCard, type MobileAppt } from "./mobile-card";
import { addDaysISO, dayRange, formatDayLong, formatMoney, formatTime, isoWeekday, todayISO, TZ, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";

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
  recurring_series: { name: string | null } | null;
  appointment_attendees: Attendee[];
};

const isAula = (a: { capacity: number; services: { kind: string } | null }) => a.services?.kind === "turma" || a.capacity > 1;

type Sp = { d?: string; bemvindo?: string; v?: string; t?: string; pro?: string; f?: string; st?: string; s?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayISO();
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const view = sp.v === "semana" ? "semana" : sp.v === "pro" ? "pro" : "dia";
  const tipo = sp.t === "consultas" || sp.t === "aulas" ? sp.t : "tudo";
  const filter = ["chamada", "evolucao", "confirmar", "risco"].includes(sp.f ?? "") ? sp.f! : null;
  const st = ["agendados", "confirmados", "concluidas", "vagos"].includes(sp.st ?? "") ? sp.st! : null;
  const selected = sp.s && /^[0-9a-f-]{36}$/.test(sp.s) ? sp.s : null;
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
        "id, starts_at, ends_at, capacity, status, series_id, services(name, kind), professionals(id, name, color), recurring_series(name), appointment_attendees(id, patient_id, status, is_makeup, booked_online, patients(name, access_via))",
      )
      .eq("clinic_id", ctx.clinicId)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, capacity, services(name, kind), professionals(id, name, color), recurring_series(name), appointment_attendees(status, patients(name))")
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
  // Dias fechados da semana (bloqueio da clínica toda de 8h ou mais)
  const { data: weekBlocks } =
    view === "semana"
      ? await supabase
          .from("time_blocks")
          .select("starts_at, ends_at, reason")
          .eq("clinic_id", ctx.clinicId)
          .is("professional_id", null)
          .lt("starts_at", weekRange.to)
          .gt("ends_at", weekRange.from)
      : { data: [] as { starts_at: string; ends_at: string; reason: string | null }[] };
  const closedDays: Record<string, string> = {};
  (weekBlocks ?? []).forEach((b) => {
    if (Date.parse(b.ends_at) - Date.parse(b.starts_at) >= 8 * 3600e3)
      closedDays[new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(b.starts_at))] = b.reason || "Fechado";
  });
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

  // Filtro por situação (barra do computador)
  const byStatus = visible.filter((a) => {
    const act = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
    if (st === "agendados") return a.appointment_attendees.some((t) => t.status === "agendado");
    if (st === "confirmados") return a.appointment_attendees.some((t) => t.status === "confirmado");
    if (st === "concluidas") return Date.parse(a.ends_at) < now || a.appointment_attendees.some((t) => t.status === "presente");
    if (st === "vagos") return act.length < a.capacity;
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
  const showWelcome = ctx.canManageAgenda && (sp.bemvindo || (!patientCount && !seriesCount));

  const href = (patch: Partial<Sp>) => {
    const q = new URLSearchParams();
    const m = {
      d: day === today ? undefined : day,
      v: view === "dia" ? undefined : view,
      t: tipo === "tudo" ? undefined : tipo,
      pro: proFilter ?? undefined,
      f: filter ?? undefined,
      st: st ?? undefined,
      s: undefined,
      ...patch,
    };
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

  // Celular: faixa na cor da clínica e semana em lista
  const brand = ctx.brandColor ?? "#0f766e";
  const tone = textOn(brand);
  const bandFg = tone === "light" ? "text-white" : "text-black";
  const bandMuted = tone === "light" ? "text-white/75" : "text-black/60";
  const bandBtn = cx(
    "relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border",
    tone === "light" ? "border-white/25 bg-white/10 text-white" : "border-black/15 bg-black/5 text-black",
  );
  const shortDate = (d: string, month = true) =>
    month ? `${Number(d.slice(8))} ${new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "")}` : String(Number(d.slice(8)));

  const chip = (on: boolean) =>
    cx(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
      on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
    );

  const seg = (on: boolean) =>
    cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap", on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink");
  const step = view === "semana" ? 7 : 1;
  const sel = selected ? all.find((a) => a.id === selected) ?? null : null;

  // Semana (computador): grade de horas + resumo da semana
  const weekList = ((weekAppts ?? []) as unknown as (GridAppt & MobileAppt)[])
    .filter((a) => !proFilter || a.professionals?.id === proFilter)
    .filter((a) => tipo === "tudo" || (tipo === "aulas" ? isAula(a) : !isAula(a)));
  const wCons = weekList.filter((a) => !isAula(a));
  const wAulas = weekList.filter(isAula);
  const nowMs = Date.now();
  const wDone = wCons.filter((a) => a.appointment_attendees.some((t) => t.status === "presente")).length;
  const wToConfirm = weekList.filter((a) => Date.parse(a.starts_at) > nowMs).reduce((n, a) => n + a.appointment_attendees.filter((t) => t.status === "agendado").length, 0);
  const wLate = weekList.filter((a) => Date.parse(a.ends_at) < nowMs && a.appointment_attendees.some((t) => t.status === "agendado" || t.status === "confirmado")).length;
  const wPeople = wAulas.reduce((n, a) => n + a.appointment_attendees.filter((t) => isActiveAttendee(t.status)).length, 0);
  const wCap = wAulas.reduce((n, a) => n + a.capacity, 0);

  const desktop = (
    <div className="hidden h-dvh flex-col lg:flex">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-3">
        <div className="flex rounded-xl bg-hover p-1">
          <Link href={href({ v: undefined })} className={seg(view !== "semana")}>
            Dia
          </Link>
          <Link href={href({ v: "semana" })} className={seg(view === "semana")}>
            Semana
          </Link>
        </div>
        <Link href={href({ d: addDaysISO(day, -step) })} aria-label="Anterior" className="grid size-10 place-items-center rounded-xl border border-line hover:bg-hover">
          <ChevronLeft size={18} />
        </Link>
        <Link href={href({ d: addDaysISO(day, step) })} aria-label="Próximo" className="grid size-10 place-items-center rounded-xl border border-line hover:bg-hover">
          <ChevronRight size={18} />
        </Link>
        {view === "semana" && (
          <span className="px-1 text-[15px] font-semibold">
            {Number(week[0].slice(8))} – {formatDayLong(week[6]).split(", ")[1]}
          </span>
        )}
        {(view === "semana" ? !week.includes(today) : day !== today) && (
          <Link href={href({ d: undefined })} className="px-1 text-sm font-medium text-accent hover:underline">
            Hoje
          </Link>
        )}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <div className="flex rounded-xl bg-hover p-1">
          {(
            [
              { t: "tudo", label: "Tudo", dot: "" },
              { t: "consultas", label: "Consultas", dot: "bg-chart-in" },
              { t: "aulas", label: "Aulas", dot: "bg-chart-out" },
            ] as const
          ).map((o) => (
            <Link key={o.t} href={href({ t: o.t === "tudo" ? undefined : o.t })} className={seg(tipo === o.t)}>
              {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />} {o.label}
            </Link>
          ))}
        </div>
        {view === "dia" && (
          <div className="flex rounded-xl bg-hover p-1">
            {(
              [
                { k: "", l: "Tudo" },
                { k: "agendados", l: "Agendados" },
                { k: "confirmados", l: "Confirmados" },
                { k: "concluidas", l: "Concluídas" },
                { k: "vagos", l: "Vagos" },
              ] as const
            ).map((o) => (
              <Link key={o.k || "tudo"} href={href({ st: o.k || undefined })} className={seg((st ?? "") === o.k)}>
                {o.l}
              </Link>
            ))}
          </div>
        )}
        {pros.length > 1 && (
          <div className="flex rounded-xl bg-hover p-1">
            <Link href={href({ pro: undefined })} className={seg(!proFilter)}>
              Todos
            </Link>
            {pros.map((p) => (
              <Link key={p.id} href={href({ pro: p.id })} className={seg(proFilter === p.id)}>
                <span className="size-2 rounded-full" style={{ background: proColor(p.color, p.id) }} /> {p.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        )}
        {view === "semana" && ctx.canManageAgenda && (
          <Link href={`/agenda/nova?d=${day}`} className={cx(buttonClass("primary", "md"), "ml-auto")}>
            <Plus size={18} /> Agendar
          </Link>
        )}
        {view !== "semana" && (
          <div className="ml-auto flex rounded-xl bg-hover p-1">
            <Link href={href({ v: undefined })} className={seg(view === "dia")}>
              Lista
            </Link>
            <Link href={href({ v: "pro" })} className={seg(view === "pro")}>
              Por profissional
            </Link>
          </div>
        )}
      </div>

      {view === "semana" ? (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
            <WeekGrid
              week={week.filter((d, i) => i < 5 || weekList.some((a) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(a.starts_at)) === d) || closedDays[d])}
              today={today}
              appts={weekList}
              closed={closedDays}
              hrefFor={(a, d) => `/agenda?d=${d}&s=${a.id}`}
              dayHref={(d) => `/agenda?d=${d}`}
            />
          </div>
          <aside className="w-[310px] shrink-0 overflow-y-auto border-l border-line bg-surface px-4 py-5">
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Resumo da semana</p>
            <p className="mb-4 text-[18px] font-semibold">
              {Number(week[0].slice(8))} – {formatDayLong(week[6]).split(", ")[1]}
            </p>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <p className="col-span-2 flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <span className="size-2.5 rounded-full bg-chart-in" /> Consultas <span className="font-normal">· semana</span>
                </p>
                <Tile n={wCons.length} label="sessões" sub="semana" />
                <Tile n={wDone} label="realizadas" sub={wCons.length ? `de ${wCons.length}` : undefined} />
                <Tile n={wToConfirm} label="a confirmar" sub="sem resposta" />
                <Tile n={wLate} label="chamadas atrasadas" sub="já passou, sem marcar" tone={wLate ? "bad" : undefined} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <p className="col-span-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <span className="size-2.5 rounded-full bg-chart-out" /> Aulas <span className="font-normal">· semana</span>
                </p>
                <Tile n={wAulas.length} label="aulas" />
                <Tile n={wPeople} label="alunos" />
                <Tile n={wCap ? `${Math.round((wPeople / wCap) * 100)}%` : "—"} label="ocupação" sub={wCap ? `${wPeople}/${wCap} vagas` : undefined} />
              </div>
              <div>
                <p className="mb-2 text-[13px] font-semibold text-muted">Ações da semana</p>
                <div className="space-y-2">
                  {[
                    { k: "conf", icon: BellRing, label: "Confirmar presença · semana", n: wToConfirm, href: "/whatsapp?aba=lembretes" },
                    { k: "cham", icon: ClipboardCheck, label: "Chamadas pendentes", n: wLate, href: href({ v: undefined, f: "chamada" }) },
                  ]
                    .filter((x) => x.n > 0)
                    .map((x) => (
                      <Link key={x.k} href={x.href} className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 hover:bg-hover">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                          <x.icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] font-medium">{x.label}</span>
                        <span className="text-sm font-semibold tabular-nums">{x.n}</span>
                        <ChevronRight size={16} className="text-faint" />
                      </Link>
                    ))}
                  {wToConfirm + wLate === 0 && <p className="text-sm text-muted">Nada pendente nesta semana. 👏</p>}
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Coluna da esquerda: dia, atalhos e linha do tempo */}
          <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-line bg-surface px-4 py-5">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{isTodayView ? "Hoje" : formatDayLong(day).split(",")[0]}</h1>
            <p className="text-sm text-muted">
              {formatDayLong(day).split(", ")[1]} · <strong className="text-ink">{consultas.length}</strong> consulta{consultas.length === 1 ? "" : "s"} ·{" "}
              <strong className="text-ink">{aulas.length}</strong> aula{aulas.length === 1 ? "" : "s"}
            </p>
            {ctx.canManageAgenda ? (
              <div className="mt-4 space-y-2">
                <Link href={`/agenda/nova?d=${day}`} className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-white transition-colors hover:bg-accent-strong">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/15">
                    <Plus size={20} />
                  </span>
                  <span>
                    <span className="block font-semibold">Agendar</span>
                    <span className="block text-[12px] text-white/80">Consulta ou alguém numa aula</span>
                  </span>
                </Link>
                <Link href={`/agenda/bloquear?d=${day}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted hover:bg-hover">
                  <Lock size={15} /> Bloquear horário
                </Link>
                <Link href="/agenda/vagas?motivo=experimental" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium hover:bg-hover">
                  <Sparkles size={15} className="text-accent" /> Aula experimental
                </Link>
                <Link href="/agenda/vagas?motivo=reposicao" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium hover:bg-hover">
                  <RefreshCcw size={15} className="text-accent" /> Repor aula
                </Link>
              </div>
            ) : (
              ctx.professionalId && (
                <Link href={`/agenda/bloquear?d=${day}`} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted hover:bg-hover">
                  <Lock size={15} /> Bloquear meu horário
                </Link>
              )
            )}

            <p className="mt-6 mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Linha do tempo</p>
            {filter && (
              <Link href={href({ f: undefined })} className="mb-2 flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2 text-[13px]">
                <span>{actions.find((a) => a.key === filter)?.label ?? "A confirmar"}</span>
                <span className="font-medium text-accent">Ver tudo</span>
              </Link>
            )}
            {blocks.map((b) => (
              <div key={b.id} className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-line bg-hover/50 px-3 py-2 text-[13px]">
                <Lock size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {formatTime(b.starts_at)}–{formatTime(b.ends_at)} · {b.reason || "Bloqueado"}
                </span>
              </div>
            ))}
            {byStatus.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{filter || st ? "Nada aqui." : "Dia livre."}</p>
            ) : (
              <ol className="relative space-y-2">
                {byStatus.map((a) => {
                  const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                  const aula = isAula(a);
                  const f = flags.get(a.id)!;
                  const on = a.id === selected;
                  const color = proColor(a.professionals?.color, a.professionals?.id);
                  const title = aula ? (a.recurring_series?.name ?? a.services?.name) : people[0]?.patients?.name ?? "Sem paciente";
                  const sub = aula ? `${people.length}/${a.capacity} ocupadas` : a.services?.name;
                  const tag = f.risco ? { t: "Em risco", c: "bg-bad-soft text-bad" } : f.chamada ? { t: "Chamada pendente", c: "bg-warn-soft text-warn" } : f.evolucao ? { t: "Evolução pendente", c: "bg-warn-soft text-warn" } : null;
                  return (
                    <li key={a.id} className="flex gap-2">
                      <span className="w-10 shrink-0 pt-2.5 text-right text-[12px] font-semibold tabular-nums">{formatTime(a.starts_at)}</span>
                      <span className="relative flex w-3 shrink-0 justify-center">
                        <span className="absolute inset-y-0 w-px bg-line" />
                        <span className="relative mt-3.5 size-2.5 rounded-full ring-2 ring-surface" style={{ background: aula ? "var(--color-chart-out)" : "var(--color-chart-in)" }} />
                      </span>
                      <Link
                        href={href({ s: a.id })}
                        aria-current={on ? "true" : undefined}
                        className={cx("min-w-0 flex-1 rounded-xl border-l-[3px] border bg-surface px-2.5 py-2 transition-colors", on ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-line hover:bg-hover")}
                        style={{ borderLeftColor: color }}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-semibold", aula ? "bg-chart-out/15 text-[#a85a17]" : "bg-chart-in/15 text-accent")}>
                            {aula ? <Users size={14} /> : (title ?? "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold">{title}</span>
                            <span className="block truncate text-[12px] text-muted">{sub}</span>
                          </span>
                        </span>
                        {tag && <span className={cx("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", tag.c)}>{tag.t}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
            {canceled.length > 0 && !filter && (
              <details className="mt-4 text-[13px] text-muted">
                <summary className="cursor-pointer">{canceled.length} cancelada(s)</summary>
                <ul className="mt-1 space-y-1">
                  {canceled.map((a) => (
                    <li key={a.id}>
                      <Link href={href({ s: a.id })} className="hover:underline">
                        {formatTime(a.starts_at)} · {a.services?.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </aside>

          {/* Meio: o que foi escolhido abre aqui */}
          <section className="min-w-0 flex-1 overflow-x-clip overflow-y-auto px-8 pt-10 pb-16">
            {view === "pro" ? (
              pros.length === 0 ? (
                <EmptyState title="Nenhum profissional ativo" text="Cadastre os profissionais em Configurações." />
              ) : (
                <ProGrid
                  day={day}
                  pros={pros.filter((p) => !proFilter || p.id === proFilter)}
                  appts={byStatus.map((a) => ({ ...a, flag: flags.get(a.id)!.evolucao ? "Evol." : flags.get(a.id)!.chamada ? "Chamada" : null })) as ProGridAppt[]}
                  blocks={blocks}
                  canBook={ctx.canManageAgenda}
                />
              )
            ) : sel ? (
              <AppointmentDetail id={sel.id} embedded />
            ) : (
              <>
                {ctx.isAdmin && isTodayView && <FirstSteps clinicId={ctx.clinicId} />}
                {showWelcome && (
                  <Card className="mb-6 p-5">
                    <p className="font-semibold">Bem-vindo(a)! Comece cadastrando pacientes e turmas.</p>
                    <div className="mt-3 flex gap-2">
                      <LinkButton href="/pacientes" variant="secondary" size="sm">
                        Pacientes
                      </LinkButton>
                      <LinkButton href="/horarios/novo" variant="secondary" size="sm">
                        Criar turma
                      </LinkButton>
                    </div>
                  </Card>
                )}
                <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
                  <span className="grid size-16 place-items-center rounded-2xl border border-line bg-surface text-muted">
                    <CalendarDays size={28} />
                  </span>
                  <p className="mt-4 text-lg font-semibold">Escolha um compromisso</p>
                  <p className="mt-1 max-w-sm text-[15px] text-muted">
                    Toque numa <strong className="text-ink">consulta</strong> para ver o paciente e marcar presença, ou numa <strong className="text-ink">aula</strong> para fazer a chamada. Tudo abre aqui, sem trocar de tela.
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Direita: resumo do dia */}
          <aside className="w-[310px] shrink-0 overflow-y-auto border-l border-line bg-surface px-4 py-5">
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Resumo do dia</p>
            <p className="mb-4 text-[18px] font-semibold">{formatDayLong(day)}</p>
            {summary}
          </aside>
        </div>
      )}
    </div>
  );

  return (
    <div data-split>
    {desktop}
    <div className="pb-28 lg:hidden">
      {/* Faixa da agenda na cor da clínica */}
      <div className={cx("px-4 pt-3 pb-4", bandFg)} style={{ background: brand }}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className={cx("text-[13px] font-medium", bandMuted)}>{view === "semana" ? "Semana" : isTodayView ? "Hoje" : "Agenda"}</p>
            <h1 className="truncate text-[24px] leading-tight font-semibold tracking-tight">
              {view === "semana" ? `${shortDate(week[0], false)} – ${shortDate(week[6])}` : `${WEEKDAYS[isoWeekday(day)]} · ${shortDate(day)}`}
            </h1>
          </div>
          <Link href={href({ d: addDaysISO(day, view === "semana" ? -7 : -1), f: undefined })} aria-label={view === "semana" ? "Semana anterior" : "Dia anterior"} className={bandBtn}>
            <ChevronLeft size={22} />
          </Link>
          <Link href={href({ d: addDaysISO(day, view === "semana" ? 7 : 1), f: undefined })} aria-label={view === "semana" ? "Próxima semana" : "Próximo dia"} className={bandBtn}>
            <ChevronRight size={22} />
          </Link>
          <details className="group relative">
            <summary className={cx(bandBtn, "list-none [&::-webkit-details-marker]:hidden")} aria-label="Filtros">
              <SlidersHorizontal size={20} />
              {(tipo !== "tudo" || proFilter || st || view === "pro") && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-warn ring-2 ring-white" />}
            </summary>
            <div className="absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-2xl border border-line bg-surface p-4 text-ink shadow-xl">
              <div>
                <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Mostrar</p>
                <div className="flex flex-wrap gap-1 rounded-xl bg-hover p-1">
                  {(
                    [
                      { t: "tudo", label: "Tudo", dot: "" },
                      { t: "consultas", label: "Consultas", dot: "bg-chart-in" },
                      { t: "aulas", label: "Aulas", dot: "bg-chart-out" },
                    ] as const
                  ).map((o) => (
                    <Link key={o.t} href={href({ t: o.t === "tudo" ? undefined : o.t })} className={chip(tipo === o.t)}>
                      {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />} {o.label}
                    </Link>
                  ))}
                </div>
              </div>
              {view !== "semana" && (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Situação</p>
                  <div className="flex flex-wrap gap-1 rounded-xl bg-hover p-1">
                    {[
                      { k: "", label: "Todas" },
                      { k: "agendados", label: "Agendadas" },
                      { k: "confirmados", label: "Confirmadas" },
                      { k: "concluidas", label: "Concluídas" },
                      { k: "vagos", label: "Com vaga" },
                    ].map((o) => (
                      <Link key={o.k || "todas"} href={href({ st: o.k || undefined })} className={chip((st ?? "") === o.k)}>
                        {o.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {pros.length > 1 && (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Profissional</p>
                  <div className="flex flex-wrap gap-1 rounded-xl bg-hover p-1">
                    <Link href={href({ pro: undefined })} className={chip(!proFilter)}>
                      Todos
                    </Link>
                    {pros.map((p) => (
                      <Link key={p.id} href={href({ pro: p.id })} className={chip(proFilter === p.id)}>
                        <span className="size-2 rounded-full" style={{ background: proColor(p.color, p.id) }} /> {p.name.split(" ")[0]}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <Link href={href({ v: view === "pro" ? undefined : "pro", f: undefined })} className={buttonClass("secondary", "md", true)}>
                <Users size={18} /> {view === "pro" ? "Voltar para a lista" : "Ver por profissional"}
              </Link>
            </div>
          </details>
        </div>
        <div className={cx("mt-4 grid grid-cols-2 gap-1 rounded-2xl p-1", tone === "light" ? "bg-white/15" : "bg-black/10")} role="tablist" aria-label="Visualização">
          {(
            [
              { v: "dia", label: "Dia" },
              { v: "semana", label: "Semana" },
            ] as const
          ).map((o) => {
            const on = o.v === "dia" ? view !== "semana" : view === "semana";
            return (
              <Link
                key={o.v}
                role="tab"
                aria-selected={on}
                href={href({ v: o.v === "dia" ? undefined : o.v, f: undefined, st: undefined })}
                className={cx("flex h-11 items-center justify-center rounded-xl text-[16px] font-semibold transition-colors", on ? "bg-surface text-ink shadow-sm" : bandMuted)}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Dias da semana */}
      {view !== "semana" && (
        <nav className="grid grid-cols-7 border-b border-line bg-surface px-2 pt-3 pb-2" aria-label="Dias da semana">
          {week.map((d) => {
            const on = d === day;
            const n = perDay.get(d) ?? 0;
            return (
              <Link key={d} href={href({ d: d === today ? undefined : d, f: undefined })} aria-current={on ? "date" : undefined} className="flex flex-col items-center gap-1 py-1">
                <span className={cx("text-[12px] font-semibold uppercase", d === today && !on ? "text-accent" : "text-muted")}>{WEEKDAYS_SHORT[isoWeekday(d)]}</span>
                <span
                  className={cx("grid size-10 place-items-center rounded-full text-[18px] font-semibold tabular-nums", on ? bandFg : d === today && "text-accent")}
                  style={on ? { background: brand } : undefined}
                >
                  {Number(d.slice(8))}
                </span>
                <span className={cx("size-1.5 rounded-full", n ? "bg-faint" : "bg-transparent")} />
              </Link>
            );
          })}
        </nav>
      )}

      <div className="space-y-3 px-4 pt-4">
        {!isTodayView && view !== "semana" && (
          <Link href={href({ d: undefined, f: undefined })} className="block text-center text-sm font-medium text-accent">
            Voltar para hoje
          </Link>
        )}
        {ctx.isAdmin && isTodayView && <FirstSteps clinicId={ctx.clinicId} />}
        {showWelcome && (
          <Card className="p-5">
            <p className="font-semibold">Bem-vindo(a)! Comece cadastrando pacientes e turmas.</p>
            <div className="mt-3 flex gap-2">
              <LinkButton href="/pacientes" variant="secondary" size="sm">
                Pacientes
              </LinkButton>
              <LinkButton href="/horarios/novo" variant="secondary" size="sm">
                Criar turma
              </LinkButton>
            </div>
          </Card>
        )}

        {view === "semana" ? (
          week.map((d) => {
            const list = weekList.filter((a) => dayFmt.format(new Date(a.starts_at)) === d);
            return (
              <section key={d} className="pt-2">
                <h2 className="mb-2 flex items-center gap-2 px-1">
                  <span className={cx("text-[17px] font-semibold", d === today && "text-accent")}>{WEEKDAYS[isoWeekday(d)]}</span>
                  <span className="text-[15px] text-muted">{shortDate(d)}</span>
                  {d === today && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">Hoje</span>}
                  <span className="ml-auto text-[13px] text-muted">
                    {closedDays[d] ? `${closedDays[d]} · fechada` : list.length ? `${list.length} ${list.length === 1 ? "item" : "itens"}` : "Livre"}
                  </span>
                </h2>
                <div className="space-y-2.5">
                  {list.map((a) => (
                    <MobileApptCard key={a.id} a={a} now={now} />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <>
            <details className="group rounded-2xl border border-line bg-surface" open={pendingCalls + pendingEvos + atRisk > 0}>
              <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold tracking-wide text-accent uppercase">Resumo {isTodayView ? "de hoje" : "do dia"}</span>
                  <span className="block text-[16px] font-semibold">
                    {consultas.length} {consultas.length === 1 ? "consulta" : "consultas"}
                    <span className="text-chart-out">
                      {" "}
                      · {aulas.length} {aulas.length === 1 ? "aula" : "aulas"}
                    </span>
                    {actions.length > 0 && <span className="font-normal text-muted"> · {actions.length} para fazer</span>}
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-faint transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-line p-4">{summary}</div>
            </details>

            {filter && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2.5 text-[15px]">
                <span>
                  Mostrando: <strong>{actions.find((a) => a.key === filter)?.label ?? (filter === "confirmar" ? "A confirmar" : "")}</strong>
                </span>
                <Link href={href({ f: undefined })} className="font-medium text-accent">
                  Ver tudo
                </Link>
              </div>
            )}

            {blocks.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-hover/60 px-4 py-3">
                <Lock size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 text-[15px]">
                  <span className="font-medium">
                    {formatTime(b.starts_at)}–{formatTime(b.ends_at)} · {b.reason || "Bloqueado"}
                  </span>
                  <span className="block text-sm text-muted">{b.professional_id ? pros.find((p) => p.id === b.professional_id)?.name : "Clínica toda"}</span>
                </span>
                {(ctx.canManageAgenda || b.professional_id === ctx.professionalId) && (
                  <form action={removeBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmit question="Tirar este bloqueio? O horário volta a ficar livre." variant="ghost" size="sm">
                      Desbloquear
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            ))}

            {view === "pro" ? (
              pros.length === 0 ? (
                <EmptyState title="Nenhum profissional ativo" text="Cadastre os profissionais em Configurações." />
              ) : (
                <ProGrid
                  day={day}
                  pros={pros.filter((p) => !proFilter || p.id === proFilter)}
                  appts={byStatus.map((a) => ({ ...a, flag: flags.get(a.id)!.evolucao ? "Evol." : flags.get(a.id)!.chamada ? "Chamada" : null })) as ProGridAppt[]}
                  blocks={blocks}
                  canBook={ctx.canManageAgenda}
                />
              )
            ) : byStatus.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={22} />}
                title={filter || st ? "Nada por aqui" : "Dia livre"}
                text={filter || st ? "Nenhuma sessão com esse filtro." : ctx.canManageAgenda ? "Nenhuma sessão neste dia. Toque no + para agendar." : "Você não tem sessões neste dia."}
              />
            ) : (
              <div className="space-y-2.5">
                {byStatus.map((a) => {
                  const f = flags.get(a.id)!;
                  const flag = f.risco
                    ? { l: "Em risco", c: "bg-bad-soft text-bad" }
                    : f.chamada
                      ? { l: "Chamada pendente", c: "bg-warn-soft text-warn" }
                      : f.evolucao
                        ? { l: "Evol. pendente", c: "bg-warn-soft text-warn" }
                        : null;
                  return <MobileApptCard key={a.id} a={a} flag={flag} now={now} />;
                })}
              </div>
            )}

            {canceled.length > 0 && !filter && (
              <details className="pt-2 text-sm text-muted">
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

      {(ctx.canManageAgenda || ctx.professionalId) && <AgendaFab day={day} full={ctx.canManageAgenda} />}
    </div>
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

