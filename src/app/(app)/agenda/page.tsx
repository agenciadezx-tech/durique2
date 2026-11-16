import Link from "next/link";
import { BellRing, Cake, CalendarDays, ChevronLeft, ChevronRight, Package, Plus, Repeat, Users } from "lucide-react";
import { buttonClass, Card, cx, EmptyState, LinkButton } from "@/components/ui";
import { WeekGrid, type GridAppt } from "./week-grid";
import { WaSendButton } from "@/components/wa-send";
import { firstName } from "@/lib/messages";
import { formatMoney } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { isActiveAttendee } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, dayRange, formatDayLong, formatTime, isoWeekday, todayISO, TZ, WEEKDAYS_SHORT } from "@/lib/format";

export const metadata = { title: "Agenda" };

type Attendee = { id: string; patient_id: string; status: string; is_makeup: boolean; booked_online: boolean; patients: { name: string; access_via: string | null } | null };
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

const DOT: Record<string, string> = {
  agendado: "bg-faint",
  confirmado: "bg-info",
  presente: "bg-ok",
  falta: "bg-bad",
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string; bemvindo?: string; v?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayISO();
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const isWeek = sp.v === "semana";
  const weekStart = addDaysISO(day, 1 - isoWeekday(day));
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const supabase = await createClient();

  // Mantém sempre as próximas 8 semanas das turmas lançadas
  if (ctx.canManageAgenda) await supabase.rpc("ensure_agenda", { p_clinic: ctx.clinicId });

  const { from, to } = dayRange(day);
  const weekRange = { from: dayRange(week[0]).from, to: dayRange(week[6]).to };
  const [{ data: appts }, { data: weekAppts }, { count: patientCount }, { count: seriesCount }] = await Promise.all([
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
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId),
    supabase.from("recurring_series").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId),
  ]);

  const perDay = new Map<string, number>();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  (weekAppts ?? []).forEach((a) => {
    const k = dayFmt.format(new Date(a.starts_at));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  });

  const list = (appts ?? []) as unknown as Appt[];
  const active = list.filter((a) => a.status === "agendado");
  const canceled = list.filter((a) => a.status === "cancelado");
  // Resumo do dia (só na visão de hoje)
  const isTodayView = day === today && !isWeek;
  const peopleToday = active.flatMap((a) => a.appointment_attendees.filter((t) => isActiveAttendee(t.status)));
  const confirmedToday = peopleToday.filter((t) => ["confirmado", "presente"].includes(t.status)).length;
  let dueToday = 0;
  let birthdays: { id: string; name: string; phone: string | null }[] = [];
  if (isTodayView && ctx.role !== "profissional") {
    const [{ data: due }, { data: bdays }] = await Promise.all([
      supabase.from("transactions").select("amount_cents").eq("clinic_id", ctx.clinicId).eq("type", "receita").is("paid_on", null).eq("due_date", today),
      supabase.from("patients").select("id, name, phone, birth_date").eq("clinic_id", ctx.clinicId).eq("active", true).not("birth_date", "is", null).limit(5000),
    ]);
    dueToday = (due ?? []).reduce((acc, t) => acc + t.amount_cents, 0);
    birthdays = (bdays ?? []).filter((p) => p.birth_date!.slice(5) === today.slice(5));
  }
  // Pacotes acabando (≤ 2 sessões ou vencendo em 7 dias)
  const { data: endingData } =
    ctx.role !== "profissional"
      ? await supabase.from("packages_ending").select("patient_id, sessions_left").eq("clinic_id", ctx.clinicId)
      : { data: [] as { patient_id: string | null; sessions_left: number | null }[] };
  const endingOf = new Map((endingData ?? []).map((e) => [e.patient_id, e.sessions_left]));
  const endingLabel = (left: number | null | undefined) =>
    left != null && left <= 0 ? "pacote acabou" : left != null ? `pacote: falta${left === 1 ? "" : "m"} ${left}` : "pacote vencendo";
  const showWelcome = ctx.canManageAgenda && (sp.bemvindo || (!patientCount && !seriesCount));

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            {isWeek ? "Semana" : day === today ? "Hoje" : formatDayLong(day).split(",")[0]}
          </h1>
          <p className="text-[15px] text-muted">
            {isWeek
              ? `${formatDayLong(week[0]).split(", ")[1]} a ${formatDayLong(week[6]).split(", ")[1]}`
              : day === today
                ? formatDayLong(day)
                : formatDayLong(day).split(", ")[1]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-hover p-1" role="tablist" aria-label="Visualização">
            {[
              { v: "dia", label: "Dia" },
              { v: "semana", label: "Semana" },
            ].map((o) => {
              const on = (o.v === "semana") === isWeek;
              return (
                <Link
                  key={o.v}
                  role="tab"
                  aria-selected={on}
                  href={`/agenda?d=${day}${o.v === "semana" ? "&v=semana" : ""}`}
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm font-medium",
                    on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
          {ctx.canManageAgenda && (
            <LinkButton href={`/agenda/nova?d=${day}`}>
              <Plus size={18} /> <span className="hidden min-[400px]:inline">Nova sessão</span>
              <span className="min-[400px]:hidden">Nova</span>
            </LinkButton>
          )}
        </div>
      </header>

      {showWelcome && (
        <Card className="mb-6 p-5 sm:p-6">
          <p className="text-[17px] font-semibold">Bem-vindo(a)! Vamos deixar sua agenda pronta em 3 passos:</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/pacientes", icon: Users, title: "1. Pacientes", text: "Cadastre ou importe da planilha.", done: !!patientCount },
              { href: "/horarios/novo", icon: Repeat, title: "2. Turmas", text: "Ex.: Pilates ter/qui 7h.", done: !!seriesCount },
              { href: "/agenda", icon: CalendarDays, title: "3. Agenda", text: "Pronto! Marque presença aqui.", done: false },
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

      {isTodayView && (active.length > 0 || birthdays.length > 0 || dueToday > 0) && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-muted">Sessões hoje</p>
            <p className="text-[22px] font-semibold tabular-nums">{active.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-muted">Confirmados</p>
            <p className="text-[22px] font-semibold tabular-nums">
              {confirmedToday}
              <span className="text-[15px] font-normal text-muted">/{peopleToday.length}</span>
            </p>
          </div>
          {ctx.role !== "profissional" && (
            <Link href="/financeiro/lancamentos?tipo=receber" className="rounded-2xl border border-line bg-surface px-4 py-3 hover:border-faint">
              <p className="text-[13px] text-muted">A receber hoje</p>
              <p className="text-[22px] font-semibold tabular-nums">{formatMoney(dueToday)}</p>
            </Link>
          )}
          {ctx.role !== "profissional" && (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="flex items-center gap-1 text-[13px] text-muted">
                <Cake size={14} /> Aniversariantes
              </p>
              <p className="text-[22px] font-semibold tabular-nums">{birthdays.length}</p>
            </div>
          )}
        </div>
      )}

      {isTodayView && endingOf.size > 0 && (
        <Link
          href="/whatsapp?aba=renovacoes"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft/50 px-4 py-3 hover:bg-warn-soft"
        >
          <Package size={20} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {endingOf.size} paciente{endingOf.size === 1 ? "" : "s"} com pacote acabando
            </span>
            <span className="text-sm text-muted">Toque para avisar pelo WhatsApp e oferecer a renovação</span>
          </span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
      )}

      {isTodayView && birthdays.length > 0 && (
        <Card className="mb-6 divide-y divide-line overflow-hidden">
          {birthdays.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                <Cake size={18} />
              </span>
              <Link href={`/pacientes/${b.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {b.name} faz aniversário hoje
              </Link>
              {b.phone && (
                <WaSendButton
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
      )}

      {isWeek ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link href={`/agenda?d=${addDaysISO(day, -7)}&v=semana`} className={buttonClass("ghost", "md")} aria-label="Semana anterior">
              <ChevronLeft size={20} /> <span className="hidden sm:inline">Anterior</span>
            </Link>
            {!week.includes(today) ? (
              <Link href="/agenda?v=semana" className="text-sm font-medium text-accent hover:underline">
                Voltar para esta semana
              </Link>
            ) : (
              <span className="text-sm text-muted">Toque numa sessão para ver os pacientes</span>
            )}
            <Link href={`/agenda?d=${addDaysISO(day, 7)}&v=semana`} className={buttonClass("ghost", "md")} aria-label="Próxima semana">
              <span className="hidden sm:inline">Próxima</span> <ChevronRight size={20} />
            </Link>
          </div>
          <WeekGrid week={week} appts={(weekAppts ?? []) as unknown as GridAppt[]} today={today} />
        </>
      ) : (
        <>
      {/* Navegação da semana */}
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/agenda?d=${addDaysISO(day, -7)}`} className={buttonClass("ghost", "md")} aria-label="Semana anterior">
          <ChevronLeft size={20} />
        </Link>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const sel = d === day;
            const n = perDay.get(d) ?? 0;
            return (
              <Link
                key={d}
                href={`/agenda?d=${d}`}
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
        <Link href={`/agenda?d=${addDaysISO(day, 7)}`} className={buttonClass("ghost", "md")} aria-label="Próxima semana">
          <ChevronRight size={20} />
        </Link>
      </div>
      {day !== today && (
        <div className="-mt-3 mb-5 text-center">
          <Link href="/agenda" className="text-sm font-medium text-accent hover:underline">
            Voltar para hoje
          </Link>
        </div>
      )}

      {ctx.role !== "profissional" && day === today && (
        <Link
          href="/whatsapp?aba=lembretes"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] transition-colors hover:border-faint"
        >
          <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-ok">
            <BellRing size={18} />
          </span>
          <span className="flex-1">
            <span className="font-medium">Lembretes de amanhã</span>
            <span className="block text-sm text-muted">Enviar pelo WhatsApp e marcar quem confirmou</span>
          </span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="Dia livre"
          text={ctx.canManageAgenda ? "Nenhuma sessão neste dia." : "Você não tem sessões neste dia."}
          action={
            ctx.canManageAgenda && (
              <LinkButton href={`/agenda/nova?d=${day}`} variant="secondary">
                <Plus size={18} /> Marcar sessão
              </LinkButton>
            )
          }
        />
      ) : (
        <ul className="space-y-3">
          {active.map((a) => {
            const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
            const turma = a.services?.kind === "turma" || a.capacity > 1;
            const past = new Date(a.ends_at) < new Date();
            return (
              <li key={a.id}>
                <Link href={`/agenda/${a.id}`} className="group block">
                  <Card className={cx("flex gap-4 p-4 transition-colors group-hover:border-faint sm:p-5", past && "opacity-75")}>
                    <div className="w-14 shrink-0 pt-0.5">
                      <p className="text-[17px] font-semibold tabular-nums">{formatTime(a.starts_at)}</p>
                      <p className="text-[13px] text-muted tabular-nums">{formatTime(a.ends_at)}</p>
                    </div>
                    <div className="min-w-0 flex-1 border-l-[3px] pl-4" style={{ borderLeftColor: proColor(a.professionals?.color, a.professionals?.id) }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{a.services?.name}</p>
                          <p className="truncate text-sm text-muted">{a.professionals?.name}</p>
                        </div>
                        {turma && (
                          <span
                            className={cx(
                              "shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium tabular-nums",
                              people.length >= a.capacity ? "bg-warn-soft text-warn" : "bg-hover text-muted",
                            )}
                          >
                            {people.length}/{a.capacity}
                          </span>
                        )}
                      </div>
                      {people.length > 0 ? (
                        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                          {people.map((t) => (
                            <li key={t.id} className="flex items-center gap-1.5 text-[15px]">
                              <span className={cx("size-2 rounded-full", DOT[t.status] ?? "bg-faint")} aria-hidden />
                              {t.patients?.name}
                              {t.is_makeup && <span className="text-[12px] text-muted">(reposição)</span>}
                              {t.booked_online && <span className="rounded-full bg-info-soft px-1.5 text-[11px] font-medium text-info">online</span>}
                              {t.patients?.access_via && <span className="rounded-full bg-info-soft px-1.5 text-[11px] font-medium text-info">{t.patients.access_via === "wellhub" ? "Wellhub" : "TotalPass"}</span>}
                              {endingOf.has(t.patient_id) && (
                                <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn">{endingLabel(endingOf.get(t.patient_id))}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2.5 text-[15px] text-faint">Sem paciente</p>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {active.length > 0 && (
        <p className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-faint" /> Agendado</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" /> Confirmado</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> Veio</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" /> Faltou</span>
        </p>
      )}

      {canceled.length > 0 && (
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
    </>
  );
}
