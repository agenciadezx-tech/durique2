import Link from "next/link";
import { Check, CheckCheck, ChevronRight, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { formatTime, isoWeekday, TZ, WEEKDAYS_SHORT } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { markAllPresent, setAttendeeStatus } from "../agenda/actions";

export type ClassOcc = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  services: { name: string } | null;
  professionals: { id: string; name: string; color: string | null } | null;
  recurring_series?: { name: string | null } | null;
  appointment_attendees: { id: string; status: string; patients: { name: string } | null }[];
};

const dayKey = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));

/** Semana de aulas em colunas, com a chamada feita no próprio card. */
export function WeekColumns({ week, today, items, canEdit }: { week: string[]; today: string; items: ClassOcc[]; canEdit: boolean }) {
  const now = Date.now();
  return (
    <div className="-mx-5 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-3 lg:mx-0 lg:scroll-px-0 lg:px-0">
      {week.map((d) => {
        const list = items.filter((a) => dayKey(a.starts_at) === d);
        return (
          <section key={d} className="w-[17rem] shrink-0 snap-start">
            <h2
              className={cx(
                "mb-2 flex items-baseline gap-2 rounded-xl px-3 py-2 text-[15px] font-semibold",
                d === today ? "bg-accent text-white" : "bg-hover text-ink",
              )}
            >
              <span className="capitalize">{WEEKDAYS_SHORT[isoWeekday(d)]}</span>
              <span className="tabular-nums">{d.slice(8)}/{d.slice(5, 7)}</span>
              <span className={cx("ml-auto text-[13px] font-normal", d === today ? "text-white/80" : "text-muted")}>
                {d === today ? "hoje · " : ""}
                {list.length} aula{list.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="space-y-3">
              {list.length === 0 && <p className="px-3 py-4 text-center text-sm text-faint">Sem aulas</p>}
              {list.map((a) => {
                const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
                const free = a.capacity - people.length;
                const started = Date.parse(a.starts_at) <= now;
                const pending = people.filter((t) => t.status === "agendado" || t.status === "confirmado");
                const confirmed = people.filter((t) => t.status === "confirmado").length;
                const color = proColor(a.professionals?.color, a.professionals?.id);
                return (
                  <article key={a.id} className="overflow-hidden rounded-2xl border border-line bg-surface" style={{ borderTop: `3px solid ${color}` }}>
                    <Link href={`/agenda/${a.id}`} className="flex items-start gap-2 px-3 pt-3 hover:opacity-80">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold tabular-nums">
                          {formatTime(a.starts_at)} <span className="text-[13px] font-normal text-muted">– {formatTime(a.ends_at)}</span>
                        </p>
                        <p className="truncate text-[15px] font-medium">{a.recurring_series?.name ?? a.services?.name}</p>
                        <p className="truncate text-[13px] text-muted">{a.professionals?.name}</p>
                      </div>
                      <ChevronRight size={18} className="mt-1 text-faint" />
                    </Link>
                    <div className="px-3 pt-2">
                      <div className="flex justify-between text-[12px] text-muted">
                        <span>
                          {people.length}/{a.capacity} alunos
                        </span>
                        {started && pending.length > 0 ? (
                          <span className="font-semibold text-warn">Chamada pendente</span>
                        ) : !started && people.length > 0 ? (
                          <span>{confirmed}/{people.length} confirmaram</span>
                        ) : null}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover">
                        <div className={cx("h-full rounded-full", free <= 0 ? "bg-warn" : "bg-chart-out")} style={{ width: `${Math.min(100, (people.length / a.capacity) * 100)}%` }} />
                      </div>
                    </div>
                    {people.length > 0 && (
                      <ul className="mt-2 divide-y divide-line border-t border-line">
                        {people.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[14px]">{t.patients?.name}</span>
                            {started && canEdit ? (
                              <div className="flex gap-1">
                                {(
                                  [
                                    { s: "presente", Icon: Check, on: "bg-ok text-white border-ok", label: "Veio" },
                                    { s: "falta", Icon: X, on: "bg-bad text-white border-bad", label: "Faltou" },
                                  ] as const
                                ).map(({ s, Icon, on, label }) => (
                                  <form key={s} action={setAttendeeStatus}>
                                    <input type="hidden" name="id" value={t.id} />
                                    <input type="hidden" name="appointment_id" value={a.id} />
                                    <input type="hidden" name="status" value={t.status === s ? "agendado" : s} />
                                    <button
                                      aria-label={`${label}: ${t.patients?.name}`}
                                      aria-pressed={t.status === s}
                                      className={cx(
                                        "grid size-9 place-items-center rounded-full border transition-colors",
                                        t.status === s ? on : "border-line text-muted hover:bg-hover",
                                      )}
                                    >
                                      <Icon size={16} />
                                    </button>
                                  </form>
                                ))}
                              </div>
                            ) : (
                              <span className={cx("text-[12px]", t.status === "confirmado" ? "text-info" : "text-muted")}>
                                {t.status === "confirmado" ? "confirmou" : t.status === "presente" ? "veio" : t.status === "falta" ? "faltou" : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-2 p-3">
                      {started && canEdit && pending.length > 0 && (
                        <form action={markAllPresent}>
                          <input type="hidden" name="appointment_id" value={a.id} />
                          <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ok/50 bg-ok-soft/50 text-sm font-medium text-ok hover:bg-ok-soft">
                            <CheckCheck size={16} /> Todos vieram · {pending.length}
                          </button>
                        </form>
                      )}
                      {!started && free > 0 && canEdit && (
                        <Link
                          href={`/agenda/${a.id}`}
                          className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-hover text-sm font-medium text-muted hover:text-ink"
                        >
                          <Plus size={16} /> Preencher vaga · {free} livre{free === 1 ? "" : "s"}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
