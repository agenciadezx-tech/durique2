import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, cx } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { formatTime } from "@/lib/format";

export type MobileAppt = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  services: { name: string; kind: string } | null;
  recurring_series?: { name: string | null } | null;
  appointment_attendees: { status: string; patients: { name: string } | null }[];
};

const STATUS: Record<string, { l: string; c: string }> = {
  confirmado: { l: "Confirmado", c: "bg-info-soft text-info" },
  presente: { l: "Veio", c: "bg-ok-soft text-ok" },
  falta: { l: "Faltou", c: "bg-bad-soft text-bad" },
};

/** Cartão de sessão do celular: hora | rosto | quem e o quê | selo. */
export function MobileApptCard({ a, flag, now, href }: { a: MobileAppt; flag?: { l: string; c: string } | null; now: number; href?: string }) {
  const aula = a.services?.kind === "turma" || a.capacity > 1;
  const people = a.appointment_attendees.filter((t) => isActiveAttendee(t.status));
  const mins = Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000);
  const person = people[0];
  const title = aula ? (a.recurring_series?.name ?? a.services?.name ?? "Aula") : (person?.patients?.name ?? "Sem paciente");
  const sub = aula ? `${people.length}/${a.capacity} ocupadas` : (a.services?.name ?? "");
  const future = Date.parse(a.starts_at) > now;
  const badge =
    flag ??
    (aula
      ? { l: "Turma", c: "bg-chart-out/12 text-chart-out" }
      : person
        ? (STATUS[person.status] ?? (future ? { l: "A confirmar", c: "bg-warn-soft text-warn" } : null))
        : null);
  return (
    <Link
      href={href ?? `/agenda/${a.id}`}
      className={cx(
        "flex min-h-[86px] items-center gap-3 rounded-2xl border border-line border-l-4 bg-surface py-3 pr-3 pl-4 shadow-[0_1px_2px_rgba(0,0,0,.03)] transition-colors active:bg-hover",
        aula ? "border-l-chart-out" : "border-l-chart-in",
      )}
    >
      <span className="w-14 shrink-0 border-r border-line pr-2">
        <span className="block text-[18px] leading-tight font-semibold tabular-nums">{formatTime(a.starts_at)}</span>
        <span className="block text-[13px] text-muted">{mins}min</span>
      </span>
      {aula ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-chart-out/12 text-chart-out">
          <Users size={19} />
        </span>
      ) : (
        <Avatar name={title} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">{title}</span>
        <span className={cx("block truncate text-[14px]", aula ? "text-chart-out" : "text-muted")}>{sub}</span>
      </span>
      {badge && <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", badge.c)}>{badge.l}</span>}
    </Link>
  );
}
