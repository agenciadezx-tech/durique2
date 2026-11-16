import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { cx } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { TZ } from "@/lib/format";
import { proColor } from "@/lib/colors";

export type ProGridAppt = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  services: { name: string; kind: string } | null;
  professionals: { id: string; name: string; color: string | null } | null;
  appointment_attendees: { status: string; patients: { name: string } | null }[];
  flag?: string | null;
};
export type ProGridBlock = { id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null };

const HOUR_PX = 64;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minutes = (ts: string) => {
  const [h, m] = timeFmt.format(new Date(ts)).split(":").map(Number);
  return h * 60 + m;
};

/** Um dia, uma coluna por profissional. Tocar num horário vazio abre o agendamento já preenchido. */
export function ProGrid({
  day,
  pros,
  appts,
  blocks,
  canBook,
}: {
  day: string;
  pros: { id: string; name: string; color: string | null }[];
  appts: ProGridAppt[];
  blocks: ProGridBlock[];
  canBook: boolean;
}) {
  const starts = [...appts.map((a) => minutes(a.starts_at)), ...blocks.map((b) => minutes(b.starts_at))];
  const ends = [...appts.map((a) => minutes(a.ends_at)), ...blocks.map((b) => minutes(b.ends_at))];
  const firstHour = Math.min(7, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.min(24, Math.max(20, ...ends.map((m) => Math.ceil(m / 60))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const top = (m: number) => ((m - firstHour * 60) / 60) * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div style={{ minWidth: Math.max(320, 56 + pros.length * 180) }}>
        <div className="sticky top-0 z-10 grid border-b border-line bg-surface" style={{ gridTemplateColumns: `3.25rem repeat(${pros.length}, 1fr)` }}>
          <div />
          {pros.map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-l border-line px-3 py-2.5 text-sm font-medium">
              <span className="size-2.5 rounded-full" style={{ background: proColor(p.color, p.id) }} />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `3.25rem repeat(${pros.length}, 1fr)`, height: hours.length * HOUR_PX }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[12px] text-faint tabular-nums" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}h`}
              </span>
            ))}
          </div>
          {pros.map((p) => {
            const mine = appts.filter((a) => a.professionals?.id === p.id);
            const myBlocks = blocks.filter((b) => !b.professional_id || b.professional_id === p.id);
            return (
              <div key={p.id} className="relative border-l border-line">
                {hours.map((h, i) =>
                  canBook ? (
                    <Link
                      key={h}
                      href={`/agenda/nova?d=${day}&pro=${p.id}&h=${String(h).padStart(2, "0")}:00`}
                      aria-label={`Agendar com ${p.name} às ${h}h`}
                      className="group absolute inset-x-0 grid place-items-center border-t border-line/70 hover:bg-accent-soft/50"
                      style={{ top: i * HOUR_PX, height: HOUR_PX }}
                    >
                      <Plus size={16} className="text-accent opacity-0 group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
                  ),
                )}
                {myBlocks.map((b) => {
                  const s = Math.max(minutes(b.starts_at), firstHour * 60);
                  const e = Math.max(s + 15, Math.min(minutes(b.ends_at) || 24 * 60, lastHour * 60));
                  return (
                    <div
                      key={`${b.id}-${p.id}`}
                      className="absolute inset-x-0.5 z-[1] flex items-start gap-1 overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(135deg,var(--color-hover)_0,var(--color-hover)_6px,var(--color-surface)_6px,var(--color-surface)_12px)] px-1.5 py-1 text-[12px] text-muted"
                      style={{ top: top(s) + 1, height: ((e - s) / 60) * HOUR_PX - 2 }}
                    >
                      <Lock size={12} className="mt-0.5 shrink-0" /> {b.reason || "Bloqueado"}
                    </div>
                  );
                })}
                {mine.map((a) => {
                  const s = minutes(a.starts_at);
                  const e = Math.max(s + 15, minutes(a.ends_at));
                  const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                  const aula = a.services?.kind === "turma" || a.capacity > 1;
                  const color = proColor(a.professionals?.color, a.professionals?.id);
                  return (
                    <Link
                      key={a.id}
                      href={`/agenda/${a.id}`}
                      className="absolute inset-x-1 z-[2] overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-shadow hover:shadow-md"
                      style={{ top: top(s) + 1, height: Math.max(28, ((e - s) / 60) * HOUR_PX - 2), borderLeftColor: color, background: `${color}22` }}
                    >
                      <p className="flex items-center justify-between gap-1 text-[12px] font-semibold">
                        <span className="truncate">
                          {timeFmt.format(new Date(a.starts_at))} {aula ? a.services?.name : (people[0]?.patients?.name ?? a.services?.name)}
                        </span>
                        {a.flag && <span className="shrink-0 rounded bg-warn-soft px-1 text-[10px] text-warn">{a.flag}</span>}
                      </p>
                      <p className={cx("truncate text-[12px] text-muted")}>{aula ? `${people.length}/${a.capacity} alunos` : a.services?.name}</p>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
