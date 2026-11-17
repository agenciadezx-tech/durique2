import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, List, Plus, Repeat, Search, Sparkles, UserPlus } from "lucide-react";
import { Alert, Card, cx, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { WeekColumns, type ClassOcc } from "./week-columns";
import { WeekGrid, type GridAppt } from "../agenda/week-grid";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, dayRange, formatDayLong, isoWeekday, todayISO, TZ, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";

export const metadata = { title: "Turmas" };

type Sp = { criados?: string; encerrado?: string; v?: string; d?: string; dia?: string; servico?: string; q?: string };

export default async function HorariosPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = sp.v === "fixos" ? "fixos" : sp.v === "colunas" ? "colunas" : "calendario";
  const supabase = await createClient();
  const today = todayISO();
  const q = (sp.q ?? "").trim().toLowerCase();
  const diaF = Number(sp.dia) >= 1 && Number(sp.dia) <= 7 ? Number(sp.dia) : null;

  const [{ data: series }, { data: svcData }] = await Promise.all([
    supabase
      .from("recurring_series")
      .select("id, name, weekday, start_time, capacity, service_id, services(name, kind), professionals(name), enrollments(id, ends_on)")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("weekday")
      .order("start_time"),
    supabase.from("services").select("id, name").eq("clinic_id", ctx.clinicId).eq("kind", "turma").eq("active", true).order("name"),
  ]);
  type Row = {
    id: string;
    name: string | null;
    weekday: number;
    start_time: string;
    capacity: number;
    service_id: string;
    services: { name: string; kind: string } | null;
    professionals: { name: string } | null;
    enrollments: { id: string; ends_on: string | null }[];
  };
  const services = svcData ?? [];
  const svcF = services.find((s) => s.id === sp.servico)?.id ?? null;
  const match = (name: string | null | undefined, svc: string | undefined, pro: string | undefined) =>
    !q || [name, svc, pro].some((x) => (x ?? "").toLowerCase().includes(q));
  const allRows = (series ?? []) as unknown as Row[];
  const rows = allRows.filter((r) => (!svcF || r.service_id === svcF) && (!diaF || r.weekday === diaF) && match(r.name, r.services?.name, r.professionals?.name));

  // Semana
  const base = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const weekStart = addDaysISO(base, 1 - isoWeekday(base));
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  if (view !== "fixos" && ctx.canManageAgenda) await supabase.rpc("ensure_agenda", { p_clinic: ctx.clinicId });
  let occQ = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, capacity, service_id, services!inner(name, kind), professionals(id, name, color), recurring_series(name), appointment_attendees(id, status, patients(name))")
    .eq("clinic_id", ctx.clinicId)
    .eq("status", "agendado")
    .eq("services.kind", "turma")
    .gte("starts_at", dayRange(week[0]).from)
    .lt("starts_at", dayRange(week[6]).to)
    .order("starts_at");
  if (svcF) occQ = occQ.eq("service_id", svcF);
  const { data: occData } = view === "fixos" ? { data: [] } : await occQ;
  const dayOf = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
  type Occ = GridAppt & ClassOcc & { recurring_series: { name: string | null } | null };
  const occ = ((occData ?? []) as unknown as Occ[]).filter(
    (a) => (!diaF || isoWeekday(dayOf(a.starts_at)) === diaF) && match(a.recurring_series?.name, a.services?.name, a.professionals?.name),
  );
  const hasWeekend = occ.some((a) => isoWeekday(dayOf(a.starts_at)) >= 6);
  const shownWeek = diaF ? week.filter((d) => isoWeekday(d) === diaF) : hasWeekend ? week : week.slice(0, 5);
  const byDay = new Map<number, Row[]>();
  rows.forEach((r) => byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]));

  const href = (patch: Partial<Sp>) => {
    const p = new URLSearchParams();
    const m: Partial<Sp> = { v: view === "calendario" ? undefined : view, d: sp.d, dia: diaF ? String(diaF) : undefined, servico: svcF ?? undefined, q: sp.q, ...patch };
    Object.entries(m).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return `/horarios${s ? `?${s}` : ""}`;
  };
  const seg = (on: boolean) => cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap", on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink");
  const usedDays = [...new Set(allRows.map((r) => r.weekday))].sort();

  return (
    <div data-wide>
      <PageHeader
        title="Turmas"
        description={`${allRows.length} turma${allRows.length === 1 ? "" : "s"} · aulas que se repetem toda semana`}
        action={
          ctx.canManageAgenda && (
            <>
              <LinkButton href="/agenda/vagas?motivo=experimental" variant="secondary" className="hidden sm:inline-flex">
                <Sparkles size={17} /> Aula experimental
              </LinkButton>
              <LinkButton href="/horarios?v=fixos" variant="secondary" className="hidden sm:inline-flex">
                <UserPlus size={17} /> Nova matrícula
              </LinkButton>
              <LinkButton href="/horarios/novo">
                <Plus size={18} /> Nova turma
              </LinkButton>
            </>
          )
        }
      />
      {sp.criados && (
        <div className="mb-5">
          <Alert tone="ok">{sp.criados} horários criados e já lançados na agenda.</Alert>
        </div>
      )}
      {sp.encerrado && (
        <div className="mb-5">
          <Alert tone="ok">Turma encerrada. As próximas aulas foram canceladas.</Alert>
        </div>
      )}

      {/* Barra: semana, busca, filtros e visualização */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {view !== "fixos" && (
          <div className="flex items-center gap-1 rounded-xl bg-hover p-1">
            <Link href={href({ d: addDaysISO(weekStart, -7) })} className="grid size-8 place-items-center rounded-lg hover:bg-surface" aria-label="Semana anterior">
              <ChevronLeft size={17} />
            </Link>
            <span className="px-2 text-sm font-semibold">
              {Number(week[0].slice(8))}–{formatDayLong(week[6]).split(", ")[1]}
            </span>
            <Link href={href({ d: addDaysISO(weekStart, 7) })} className="grid size-8 place-items-center rounded-lg hover:bg-surface" aria-label="Próxima semana">
              <ChevronRight size={17} />
            </Link>
          </div>
        )}
        <form action="/horarios" className="relative min-w-52 flex-1">
          {view !== "calendario" && <input type="hidden" name="v" value={view} />}
          {svcF && <input type="hidden" name="servico" value={svcF} />}
          {diaF && <input type="hidden" name="dia" value={diaF} />}
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Buscar turma ou professor…"
            aria-label="Buscar turma"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-[16px] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </form>
        <div className="flex rounded-xl bg-hover p-1" role="tablist" aria-label="Visualização">
          <Link href={href({ v: undefined })} className={seg(view === "calendario")}>
            <CalendarDays size={14} /> Calendário
          </Link>
          <Link href={href({ v: "colunas" })} className={seg(view === "colunas")}>
            <Columns3 size={14} /> Colunas
          </Link>
          <Link href={href({ v: "fixos" })} className={seg(view === "fixos")}>
            <List size={14} /> Turmas fixas
          </Link>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted">Dias</p>
          <div className="flex flex-wrap rounded-xl bg-hover p-1">
            <Link href={href({ dia: undefined })} className={seg(!diaF)}>
              Todos
            </Link>
            {usedDays.map((d) => (
              <Link key={d} href={href({ dia: String(d) })} className={cx(seg(diaF === d), "capitalize")}>
                {WEEKDAYS_SHORT[d]}
              </Link>
            ))}
          </div>
        </div>
        {services.length > 1 && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">Serviço</p>
            <div className="flex flex-wrap rounded-xl bg-hover p-1">
              <Link href={href({ servico: undefined })} className={seg(!svcF)}>
                Todos
              </Link>
              {services.map((s) => (
                <Link key={s.id} href={href({ servico: s.id })} className={seg(svcF === s.id)}>
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {allRows.length === 0 ? (
        <EmptyState
          icon={<Repeat size={22} />}
          title="Nenhuma turma ainda"
          text="Ex.: Pilates toda terça e quinta às 7h, com 4 vagas. Você cria uma vez e a agenda das próximas semanas aparece pronta."
          action={
            ctx.canManageAgenda && (
              <LinkButton href="/horarios/novo">
                <Plus size={18} /> Criar primeira turma
              </LinkButton>
            )
          }
        />
      ) : view === "fixos" ? (
        rows.length === 0 ? (
          <p className="py-10 text-center text-muted">Nenhuma turma com esses filtros.</p>
        ) : (
          <div className="space-y-6">
            {view === "fixos" && ctx.canManageAgenda && <p className="text-sm text-muted">Para matricular alguém, abra a turma e toque em Adicionar.</p>}
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
                            <p className="truncate font-medium">{s.name ?? s.services?.name}</p>
                            <p className="truncate text-sm text-muted">
                              {s.name ? `${s.services?.name} · ` : ""}
                              {s.professionals?.name}
                            </p>
                          </div>
                          <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium tabular-nums", full ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
                            {taken}/{s.capacity} vagas
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-faint" />
                        </Link>
                      );
                    })}
                  </Card>
                </section>
              ))}
          </div>
        )
      ) : occ.length === 0 ? (
        <EmptyState icon={<Repeat size={22} />} title="Nenhuma aula nesta semana" text="Mude a semana ou tire os filtros." />
      ) : (
        <>
          {view === "calendario" && (
            <div className="hidden lg:block">
              <WeekGrid variant="turmas" week={shownWeek} today={today} appts={occ} hrefFor={(a, d) => `/agenda?d=${d}&s=${a.id}`} dayHref={(d) => `/agenda?d=${d}&t=aulas`} />
            </div>
          )}
          <div className={view === "calendario" ? "lg:hidden" : undefined}>
            <WeekColumns week={shownWeek} today={today} items={occ} canEdit={ctx.canManageAgenda || !!ctx.professionalId} />
          </div>
        </>
      )}
    </div>
  );
}
