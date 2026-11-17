import Link from "next/link";
import { Activity, Users } from "lucide-react";
import { cx } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { isoWeekday, TZ, WEEKDAYS_SHORT } from "@/lib/format";
import { proColor } from "@/lib/colors";

export type GridAppt = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  services: { name: string; kind: string } | null;
  professionals: { id: string; name: string; color: string | null } | null;
  recurring_series?: { name: string | null } | null;
  appointment_attendees: { status: string; patients: { name: string } | null }[];
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const STATUS: Record<string, { l: string; c: string }> = {
  agendado: { l: "Agendado", c: "bg-surface text-muted" },
  confirmado: { l: "Confirmado", c: "bg-info-soft text-info" },
  presente: { l: "Atendida", c: "bg-ok-soft text-ok" },
  falta: { l: "Faltou", c: "bg-bad-soft text-bad" },
};

function minutesOfDay(ts: string) {
  const [h, m] = timeFmt.format(new Date(ts)).split(":").map(Number);
  return h * 60 + m;
}
export const isAulaAppt = (a: { capacity: number; services: { kind: string } | null }) => a.services?.kind === "turma" || a.capacity > 1;

/** Distribui sessões que se sobrepõem lado a lado. */
function layout(list: GridAppt[]) {
  const items = list
    .map((a) => ({ a, start: minutesOfDay(a.starts_at), end: Math.max(minutesOfDay(a.starts_at) + 15, minutesOfDay(a.ends_at)) }))
    .sort((x, y) => x.start - y.start);
  const out: { a: GridAppt; start: number; end: number; col: number; cols: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => (c.cols = n));
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...it, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

/**
 * Semana em grade de horas. `variant="agenda"` (tela Hoje · Semana) ou `"turmas"` (tela Turmas: nome, horário e ocupação).
 * `closed` marca dias fechados (feriado/bloqueio da clínica toda) com listras.
 */
export function WeekGrid({
  week,
  appts,
  today,
  hrefFor = (a) => `/agenda/${a.id}`,
  dayHref = (d) => `/agenda?d=${d}`,
  closed = {},
  variant = "agenda",
  movable = false,
}: {
  week: string[];
  appts: GridAppt[];
  today: string;
  hrefFor?: (a: GridAppt, day: string) => string;
  dayHref?: (d: string) => string;
  closed?: Record<string, string>;
  variant?: "agenda" | "turmas";
  /** Deixa arrastar os cartões para outro dia/horário (precisa estar dentro de <DragMove>). */
  movable?: boolean;
}) {
  const nowMs = Date.now();
  const HOUR_PX = variant === "turmas" ? 96 : 64;
  const byDay = new Map<string, GridAppt[]>(week.map((d) => [d, []]));
  appts.forEach((a) => byDay.get(dayFmt.format(new Date(a.starts_at)))?.push(a));

  const starts = appts.map((a) => minutesOfDay(a.starts_at));
  const ends = appts.map((a) => minutesOfDay(a.ends_at));
  const firstHour = Math.min(7, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(variant === "turmas" ? 12 : 19, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR_PX;
  const cols = `3.5rem repeat(${week.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div style={{ minWidth: week.length * 120 + 56 }}>
        {/* Cabeçalho dos dias */}
        <div className="sticky top-0 z-10 grid border-b border-line bg-surface" style={{ gridTemplateColumns: cols }}>
          <div />
          {week.map((d) => {
            const n = byDay.get(d)?.length ?? 0;
            const isToday = d === today;
            return (
              <Link key={d} href={dayHref(d)} data-drop-day={movable ? d : undefined} className={cx("flex flex-col items-center gap-0.5 border-l border-line py-2 hover:bg-hover", isToday && "bg-accent-soft/40")}>
                <span className={cx("text-[12px] font-semibold tracking-wide uppercase", isToday ? "text-accent" : "text-muted")}>{WEEKDAYS_SHORT[isoWeekday(d)]}</span>
                <span className={cx("grid size-8 place-items-center rounded-full text-[17px] font-semibold tabular-nums", isToday && "bg-accent text-white")}>{Number(d.slice(8))}</span>
                {closed[d] ? (
                  <span className="rounded-full bg-warn-soft px-2 text-[11px] font-semibold text-warn">{closed[d]} · fechada</span>
                ) : (
                  variant === "turmas" && (
                    <span className="text-[11px] text-muted">
                      {n} aula{n === 1 ? "" : "s"}
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </div>

        <div className="relative grid" style={{ height, gridTemplateColumns: cols }}>
          {/* Horas */}
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[12px] text-faint tabular-nums" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {week.map((d) => (
            <div
              key={d}
              data-drop-day={movable ? d : undefined}
              data-hour-px={movable ? HOUR_PX : undefined}
              data-first-hour={movable ? firstHour : undefined}
              className={cx("relative border-l border-line", d === today && "bg-accent-soft/20")}
              style={closed[d] ? { backgroundImage: "repeating-linear-gradient(135deg, transparent 0 10px, rgba(217,122,43,.10) 10px 20px)" } : undefined}
            >
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
              ))}
              {layout(byDay.get(d) ?? []).map(({ a, start, end, col, cols: nCols }) => {
                const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                const aula = isAulaAppt(a);
                const top = ((start - firstHour * 60) / 60) * HOUR_PX;
                const h = Math.max(30, ((end - start) / 60) * HOUR_PX - 3);
                const color = proColor(a.professionals?.color, a.professionals?.id);
                const title = aula ? (a.recurring_series?.name ?? a.services?.name) : (people[0]?.patients?.name ?? a.services?.name);
                const st = !aula && people[0] ? STATUS[people[0].status] : null;
                const free = Math.max(0, a.capacity - people.length);
                return (
                  <Link
                    key={a.id}
                    href={hrefFor(a, d)}
                    data-move={
                      movable && Date.parse(a.starts_at) > nowMs
                        ? JSON.stringify({ id: a.id, title: title ?? "Sessão", date: d, time: timeFmt.format(new Date(a.starts_at)), people: people.length })
                        : undefined
                    }
                    title={`${timeFmt.format(new Date(a.starts_at))} · ${title} · ${a.professionals?.name}`}
                    className={cx(
                      "absolute overflow-hidden rounded-lg border border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-shadow hover:z-10 hover:shadow-md",
                      movable && "cursor-grab active:cursor-grabbing",
                      variant === "turmas" ? "bg-surface" : aula ? "bg-chart-out/10" : "bg-chart-in/10",
                    )}
                    style={{
                      top: top + 1,
                      height: h,
                      left: `calc(${(col / nCols) * 100}% + 3px)`,
                      width: `calc(${100 / nCols}% - 6px)`,
                      borderColor: "var(--color-line)",
                      borderLeftColor: variant === "turmas" ? "var(--color-chart-out)" : color,
                    }}
                  >
                    {variant === "turmas" ? (
                      <>
                        <p className="truncate text-[13px] leading-tight font-semibold">{title}</p>
                        <p className="text-[12px] text-muted tabular-nums">
                          {timeFmt.format(new Date(a.starts_at))}–{timeFmt.format(new Date(a.ends_at))}
                        </p>
                        {h > 56 && (
                          <>
                            <p className={cx("truncate text-[12px]", free === 0 ? "font-medium text-warn" : "text-muted")}>
                              {people.length}/{a.capacity} ocupadas · {free === 0 ? "lotada" : `${free} vaga${free === 1 ? "" : "s"}`}
                            </p>
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-hover">
                              <span className="block h-full rounded-full bg-chart-out" style={{ width: `${Math.min(100, (people.length / a.capacity) * 100)}%` }} />
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="flex items-center gap-1 truncate text-[12px] leading-tight font-semibold">
                          {aula ? <Users size={12} className="shrink-0 text-muted" /> : <Activity size={12} className="shrink-0 text-muted" />}
                          <span className="tabular-nums">{timeFmt.format(new Date(a.starts_at))}</span>
                          {nCols === 1 && <span className="truncate">{title}</span>}
                        </p>
                        {h > 40 && (
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
                            {aula ? (
                              <span className={cx(people.length >= a.capacity && "font-medium text-warn")}>
                                {people.length}/{a.capacity} ocupadas
                              </span>
                            ) : (
                              st && <span className={cx("rounded px-1 py-px text-[10px] font-semibold", st.c)}>{st.l}</span>
                            )}
                            {nCols === 1 && (
                              <span className="flex min-w-0 items-center gap-1 truncate">
                                <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                                {a.professionals?.name?.split(" ")[0]}
                              </span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
