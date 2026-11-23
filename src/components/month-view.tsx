import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "./ui";
import { addDaysISO, dayRange, formatMonth, isoWeekday, monthRange, todayISO, TZ } from "@/lib/format";
import { nationalHolidays } from "@/lib/holidays";
import { createClient } from "@/lib/supabase/server";

type Kind = "tudo" | "consultas" | "aulas";
type Row = { starts_at: string; capacity: number; services: { kind: string } | null; appointment_attendees: { status: string }[] };

const ACTIVE = ["agendado", "confirmado", "presente"];
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Calendário do mês (Agenda e Turmas): em cada dia, quantas consultas (verde-água) e aulas (laranja),
 * feriado/dia fechado listrado e hoje destacado. Tocar no dia abre aquele dia.
 */
export async function MonthView({
  clinicId,
  month,
  tipo = "tudo",
  mode,
  views,
}: {
  clinicId: string;
  month?: string;
  tipo?: Kind;
  /** agenda: tudo; turmas: só aulas, com ocupação */
  mode: "agenda" | "turmas";
  /** botões de visão (Dia | Semana | Mês…) para trocar daqui */
  views: { label: string; href: string; on?: boolean }[];
}) {
  const today = todayISO();
  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const { from, to } = monthRange(key);
  const first = addDaysISO(from, 1 - isoWeekday(from));
  const last = addDaysISO(to, 7 - isoWeekday(to));
  const days: string[] = [];
  for (let d = first; d <= last; d = addDaysISO(d, 1)) days.push(d);

  const supabase = await createClient();
  const [{ data }, { data: blocks }] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, capacity, services(kind), appointment_attendees(status)")
      .eq("clinic_id", clinicId)
      .eq("status", "agendado")
      .gte("starts_at", dayRange(first).from)
      .lt("starts_at", dayRange(last).to)
      .limit(5000),
    supabase
      .from("time_blocks")
      .select("starts_at, ends_at, reason")
      .eq("clinic_id", clinicId)
      .is("professional_id", null)
      .lt("starts_at", dayRange(last).to)
      .gt("ends_at", dayRange(first).from),
  ]);
  const dayOf = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
  const stats = new Map<string, { c: number; a: number; people: number; cap: number }>();
  ((data ?? []) as unknown as Row[]).forEach((r) => {
    const aula = r.capacity > 1 || r.services?.kind === "turma";
    if (mode === "turmas" && !aula) return;
    if (tipo === "consultas" && aula) return;
    if (tipo === "aulas" && !aula) return;
    const k = dayOf(r.starts_at);
    const s = stats.get(k) ?? { c: 0, a: 0, people: 0, cap: 0 };
    if (aula) {
      s.a += 1;
      s.cap += r.capacity;
      s.people += r.appointment_attendees.filter((t) => ACTIVE.includes(t.status)).length;
    } else if (r.appointment_attendees.some((t) => ACTIVE.includes(t.status))) s.c += 1;
    stats.set(k, s);
  });
  const closed = new Map<string, string>();
  (blocks ?? []).forEach((b) => {
    if (Date.parse(b.ends_at) - Date.parse(b.starts_at) >= 8 * 3600e3) closed.set(dayOf(b.starts_at), b.reason || "Fechado");
  });
  const holidays = new Map([...nationalHolidays(Number(key.slice(0, 4))), ...nationalHolidays(Number(key.slice(0, 4)) + 1)].map((h) => [h.date, h.name]));

  const inMonth = [...stats.entries()].filter(([d]) => d.startsWith(key));
  const totC = inMonth.reduce((n, [, s]) => n + s.c, 0);
  const totA = inMonth.reduce((n, [, s]) => n + s.a, 0);
  const people = inMonth.reduce((n, [, s]) => n + s.people, 0);
  const cap = inMonth.reduce((n, [, s]) => n + s.cap, 0);
  const base = mode === "agenda" ? "/agenda" : "/horarios";
  const monthHref = (m: string) => `${base}?v=mes&m=${m}${tipo !== "tudo" && mode === "agenda" ? `&t=${tipo}` : ""}`;
  const dayHref = (d: string) => (mode === "agenda" ? `/agenda?d=${d}${tipo !== "tudo" ? `&t=${tipo}` : ""}` : `/horarios?d=${d}&sel=${d}`);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[24px] leading-tight font-semibold tracking-tight capitalize">{formatMonth(key)}</h1>
        <div className="flex rounded-xl bg-hover p-1">
          {views.map((v) => (
            <Link key={v.label} href={v.href} aria-current={v.on ? "page" : undefined} className={cx("inline-flex h-9 items-center rounded-lg px-3.5 text-[14px] font-semibold", v.on ? "bg-surface text-ink shadow-sm" : "text-muted")}>
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={monthHref(shiftMonth(key, -1))} aria-label="Mês anterior" className="grid size-11 place-items-center rounded-xl border border-line bg-surface hover:bg-hover">
            <ChevronLeft size={20} />
          </Link>
          <Link href={monthHref(shiftMonth(key, 1))} aria-label="Próximo mês" className="grid size-11 place-items-center rounded-xl border border-line bg-surface hover:bg-hover">
            <ChevronRight size={20} />
          </Link>
          {key !== today.slice(0, 7) && (
            <Link href={monthHref(today.slice(0, 7))} className="px-2 text-[14px] font-semibold text-accent">
              Hoje
            </Link>
          )}
        </div>
      </header>

      {mode === "agenda" && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { t: "tudo", l: "Tudo", dot: "" },
              { t: "consultas", l: "Consultas", dot: "bg-chart-in" },
              { t: "aulas", l: "Aulas", dot: "bg-chart-out" },
            ] as const
          ).map((o) => (
            <Link
              key={o.t}
              href={`/agenda?v=mes&m=${key}${o.t !== "tudo" ? `&t=${o.t}` : ""}`}
              className={cx(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold",
                tipo === o.t ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted",
              )}
            >
              {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />} {o.l}
            </Link>
          ))}
        </div>
      )}

      <p className="text-[15px] text-muted">
        {mode === "agenda" ? (
          <>
            {tipo !== "aulas" && (
              <>
                <b className="text-ink">{totC}</b> consulta{totC === 1 ? "" : "s"}
              </>
            )}
            {tipo === "tudo" && " · "}
            {tipo !== "consultas" && (
              <>
                <b className="text-ink">{totA}</b> aula{totA === 1 ? "" : "s"}
              </>
            )}{" "}
            no mês
          </>
        ) : (
          <>
            <b className="text-ink">{totA}</b> aula{totA === 1 ? "" : "s"} no mês · {cap ? Math.round((people / cap) * 100) : 0}% das vagas ocupadas
          </>
        )}
      </p>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-bg">
          {WD.map((w) => (
            <span key={w} className="py-2 text-center text-[12px] font-semibold tracking-wide text-muted uppercase">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const s = stats.get(d);
            const out = !d.startsWith(key);
            const isToday = d === today;
            const off = closed.get(d) ?? holidays.get(d);
            const occ = s && s.cap ? Math.round((s.people / s.cap) * 100) : null;
            return (
              <Link
                key={d}
                href={dayHref(d)}
                aria-label={`${d.slice(8)}: ${s ? `${s.c} consultas, ${s.a} aulas` : "nada marcado"}${off ? `, ${off}` : ""}`}
                className={cx(
                  "relative flex min-h-[4.25rem] flex-col gap-1 border-line p-1.5 transition-colors hover:bg-hover sm:min-h-24 sm:p-2",
                  i % 7 !== 6 && "border-r",
                  i < days.length - 7 && "border-b",
                  out && "bg-bg/60 text-faint",
                  off && "bg-[repeating-linear-gradient(45deg,var(--color-hover),var(--color-hover)_5px,transparent_5px,transparent_10px)]",
                )}
              >
                <span
                  className={cx(
                    "grid size-7 place-items-center rounded-full text-[14px] font-semibold tabular-nums sm:size-8 sm:text-[15px]",
                    isToday ? "bg-accent text-white" : out ? "" : "text-ink",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {off && !out && <span className="hidden truncate text-[11px] font-medium text-muted sm:block">{off}</span>}
                {s && (s.c > 0 || s.a > 0) && (
                  <span className="mt-auto flex flex-wrap gap-1">
                    {s.c > 0 && (
                      <span className="inline-flex min-w-6 items-center justify-center gap-0.5 rounded-md bg-chart-in/15 px-1 text-[12px] font-bold text-accent tabular-nums">
                        {s.c}
                        <span className="hidden font-medium sm:inline"> cons.</span>
                      </span>
                    )}
                    {s.a > 0 && (
                      <span className="inline-flex min-w-6 items-center justify-center gap-0.5 rounded-md bg-chart-out/20 px-1 text-[12px] font-bold text-[#a85a17] tabular-nums">
                        {s.a}
                        <span className="hidden font-medium sm:inline"> aula{s.a === 1 ? "" : "s"}</span>
                      </span>
                    )}
                    {mode === "turmas" && occ != null && <span className="hidden text-[11px] text-muted sm:inline">{occ}%</span>}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
        {mode === "agenda" && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-chart-in/40" /> Consultas
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-chart-out/50" /> Aulas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-line),var(--color-line)_2px,transparent_2px,transparent_4px)]" /> Feriado ou fechado
        </span>
        <span>Toque num dia para abrir.</span>
      </div>
    </div>
  );
}
