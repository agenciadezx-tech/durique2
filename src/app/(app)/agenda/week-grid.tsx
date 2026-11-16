import Link from "next/link";
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
  appointment_attendees: { status: string; patients: { name: string } | null }[];
};

const HOUR_PX = 64;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

function minutesOfDay(ts: string) {
  const [h, m] = timeFmt.format(new Date(ts)).split(":").map(Number);
  return h * 60 + m;
}

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

export function WeekGrid({ week, appts, today }: { week: string[]; appts: GridAppt[]; today: string }) {
  const byDay = new Map<string, GridAppt[]>(week.map((d) => [d, []]));
  appts.forEach((a) => byDay.get(dayFmt.format(new Date(a.starts_at)))?.push(a));

  const starts = appts.map((a) => minutesOfDay(a.starts_at));
  const ends = appts.map((a) => minutesOfDay(a.ends_at));
  const firstHour = Math.min(7, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(19, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div className="min-w-[720px]">
        {/* Cabeçalho dos dias */}
        <div className="sticky top-0 z-10 grid grid-cols-[3.25rem_repeat(7,1fr)] border-b border-line bg-surface">
          <div />
          {week.map((d) => (
            <Link
              key={d}
              href={`/agenda?d=${d}`}
              className={cx("flex flex-col items-center py-2 hover:bg-hover", d === today && "text-accent")}
            >
              <span className="text-[12px] text-muted capitalize">{WEEKDAYS_SHORT[isoWeekday(d)]}</span>
              <span
                className={cx(
                  "grid size-8 place-items-center rounded-full text-[16px] font-semibold tabular-nums",
                  d === today && "bg-accent text-white",
                )}
              >
                {Number(d.slice(8))}
              </span>
            </Link>
          ))}
        </div>

        <div className="relative grid grid-cols-[3.25rem_repeat(7,1fr)]" style={{ height }}>
          {/* Horas */}
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[12px] text-faint tabular-nums" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}h`}
              </span>
            ))}
          </div>

          {week.map((d) => (
            <div key={d} className={cx("relative border-l border-line", d === today && "bg-accent-soft/30")}>
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
              ))}
              {layout(byDay.get(d) ?? []).map(({ a, start, end, col, cols }) => {
                const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                const turma = a.services?.kind === "turma" || a.capacity > 1;
                const top = ((start - firstHour * 60) / 60) * HOUR_PX;
                const h = Math.max(26, ((end - start) / 60) * HOUR_PX - 2);
                const full = people.length >= a.capacity;
                return (
                  <Link
                    key={a.id}
                    href={`/agenda/${a.id}`}
                    title={`${timeFmt.format(new Date(a.starts_at))} · ${a.services?.name} · ${a.professionals?.name}${people.length ? ` · ${people.map((p) => p.patients?.name).join(", ")}` : ""}`}
                    className="absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left transition-shadow hover:z-10 hover:shadow-md"
                    style={{
                      top: top + 1,
                      height: h,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                      borderLeftColor: proColor(a.professionals?.color, a.professionals?.id),
                      background: `${proColor(a.professionals?.color, a.professionals?.id)}${people.length === 0 ? "12" : "24"}`,
                    }}
                  >
                    <p className={cx("leading-tight font-semibold whitespace-nowrap text-ink", cols > 1 ? "text-[11px]" : "truncate text-[12px]")}>
                      {timeFmt.format(new Date(a.starts_at))}
                      {turma && cols === 1 ? (
                        <span className={cx("ml-1 font-medium", full ? "text-warn" : "text-muted")}>
                          {people.length}/{a.capacity}
                        </span>
                      ) : null}
                    </p>
                    {turma && cols > 1 && (
                      <p className={cx("text-[11px] leading-tight font-medium", full ? "text-warn" : "text-muted")}>
                        {people.length}/{a.capacity}
                      </p>
                    )}
                    {h > 34 && cols === 1 && (
                      <p className="truncate text-[12px] leading-tight text-ink">
                        {turma || people.length !== 1 ? a.services?.name : people[0].patients?.name}
                      </p>
                    )}
                    {h > 50 && cols === 1 && <p className="truncate text-[11px] leading-tight text-muted">{a.professionals?.name}</p>}
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
