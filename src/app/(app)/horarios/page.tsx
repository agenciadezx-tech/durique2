import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { Alert, buttonClass, Card, cx, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { WeekColumns, type ClassOcc } from "./week-columns";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, dayRange, formatDayLong, isoWeekday, todayISO, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Turmas" };

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ criados?: string; encerrado?: string; v?: string; d?: string }>;
}) {
  const ctx = await getContext();
  const { criados, encerrado, v, d } = await searchParams;
  const view = v === "fixos" ? "fixos" : "semana";
  const supabase = await createClient();
  const today = todayISO();
  const { data: series } = await supabase
    .from("recurring_series")
    .select("id, weekday, start_time, capacity, services(name, kind), professionals(name), enrollments(id, ends_on)")
    .eq("clinic_id", ctx.clinicId)
    .eq("active", true)
    .order("weekday")
    .order("start_time");

  type Row = {
    id: string;
    weekday: number;
    start_time: string;
    capacity: number;
    services: { name: string; kind: string } | null;
    professionals: { name: string } | null;
    enrollments: { id: string; ends_on: string | null }[];
  };
  const rows = (series ?? []) as unknown as Row[];

  // Semana de aulas (ocorrências) para a chamada
  const base = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  const weekStart = addDaysISO(base, 1 - isoWeekday(base));
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  if (view === "semana" && ctx.canManageAgenda) await supabase.rpc("ensure_agenda", { p_clinic: ctx.clinicId });
  const { data: occ } =
    view === "semana"
      ? await supabase
          .from("appointments")
          .select("id, starts_at, ends_at, capacity, services!inner(name, kind), professionals(id, name, color), appointment_attendees(id, status, patients(name))")
          .eq("clinic_id", ctx.clinicId)
          .eq("status", "agendado")
          .eq("services.kind", "turma")
          .gte("starts_at", dayRange(week[0]).from)
          .lt("starts_at", dayRange(week[6]).to)
          .order("starts_at")
      : { data: [] };
  const hasSat = (occ ?? []).some((a) => isoWeekday(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(a.starts_at))) >= 6);
  const shownWeek = hasSat ? week : week.slice(0, 5);
  const byDay = new Map<number, Row[]>();
  rows.forEach((r) => byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]));

  return (
    <div data-wide>
      <PageHeader
        title="Turmas"
        description="Aulas e atendimentos que se repetem toda semana. A agenda é preenchida sozinha."
        action={
          ctx.canManageAgenda &&
          rows.length > 0 && (
            <LinkButton href="/horarios/novo">
              <Plus size={18} /> Novo horário
            </LinkButton>
          )
        }
      />
      {criados && <div className="mb-5"><Alert tone="ok">{criados} horários criados e já lançados na agenda.</Alert></div>}
      {encerrado && <div className="mb-5"><Alert tone="ok">Horário encerrado. As próximas sessões foram canceladas.</Alert></div>}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-hover p-1" role="tablist" aria-label="Visualização">
          {(
            [
              { k: "semana", label: "Esta semana" },
              { k: "fixos", label: "Horários fixos" },
            ] as const
          ).map((o) => (
            <Link
              key={o.k}
              role="tab"
              aria-selected={view === o.k}
              href={o.k === "semana" ? "/horarios" : "/horarios?v=fixos"}
              className={cx(
                "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium",
                view === o.k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
        {view === "semana" && (
          <div className="flex items-center gap-1">
            <Link href={`/horarios?d=${addDaysISO(weekStart, -7)}`} className={buttonClass("ghost", "sm")} aria-label="Semana anterior">
              <ChevronLeft size={18} />
            </Link>
            <span className="text-sm font-medium">
              {formatDayLong(week[0]).split(", ")[1]} a {formatDayLong(week[6]).split(", ")[1]}
            </span>
            <Link href={`/horarios?d=${addDaysISO(weekStart, 7)}`} className={buttonClass("ghost", "sm")} aria-label="Próxima semana">
              <ChevronRight size={18} />
            </Link>
          </div>
        )}
      </div>

      {view === "semana" && rows.length > 0 ? (
        (occ ?? []).length === 0 ? (
          <EmptyState icon={<Repeat size={22} />} title="Nenhuma aula em grupo nesta semana" text="As aulas das turmas aparecem aqui com a chamada." />
        ) : (
          <WeekColumns week={shownWeek} today={today} items={(occ ?? []) as unknown as ClassOcc[]} canEdit={ctx.canManageAgenda || !!ctx.professionalId} />
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Repeat size={22} />}
          title="Nenhuma turma ainda"
          text="Ex.: Pilates toda terça e quinta às 7h, com 4 vagas. Você cria uma vez e a agenda das próximas semanas aparece pronta."
          action={
            ctx.canManageAgenda && (
              <LinkButton href="/horarios/novo">
                <Plus size={18} /> Criar primeiro horário
              </LinkButton>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {[1, 2, 3, 4, 5, 6, 7]
            .filter((d) => byDay.has(d))
            .map((d) => (
              <section key={d}>
                <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{WEEKDAYS[d]}</h2>
                <Card className="divide-y divide-line overflow-hidden">
                  {byDay.get(d)!.map((s) => {
                    const taken = s.enrollments.filter((e) => !e.ends_on || e.ends_on >= today).length;
                    const full = taken >= s.capacity;
                    return (
                      <Link key={s.id} href={`/horarios/${s.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-hover">
                        <span className="w-14 shrink-0 text-lg font-semibold tabular-nums">{s.start_time.slice(0, 5)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.services?.name}</p>
                          <p className="truncate text-sm text-muted">{s.professionals?.name}</p>
                        </div>
                        <span
                          className={
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium tabular-nums " +
                            (full ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")
                          }
                        >
                          {taken}/{s.capacity} {s.capacity === 1 ? "vaga" : "vagas"}
                        </span>
                        <ChevronRight size={18} className="shrink-0 text-faint" />
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
