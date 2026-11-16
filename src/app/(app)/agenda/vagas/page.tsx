import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { getContext } from "@/lib/context";
import { formatDayLong, formatTime, TZ } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Aulas com vaga" };

type Row = {
  id: string;
  starts_at: string;
  capacity: number;
  services: { name: string } | null;
  professionals: { id: string; name: string; color: string | null } | null;
  appointment_attendees: { status: string }[];
};

export default async function VagasPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const ctx = await getContext();
  const { motivo } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, starts_at, capacity, services(name), professionals(id, name, color), appointment_attendees(status)")
    .eq("clinic_id", ctx.clinicId)
    .eq("status", "agendado")
    .gt("capacity", 1)
    .gte("starts_at", new Date().toISOString())
    .lte("starts_at", new Date(Date.now() + 14 * 864e5).toISOString())
    .order("starts_at");
  const rows = ((data ?? []) as unknown as Row[])
    .map((r) => ({ ...r, free: r.capacity - r.appointment_attendees.filter((t) => isActiveAttendee(t.status)).length }))
    .filter((r) => r.free > 0);
  const dayKey = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
  const days = [...new Set(rows.map((r) => dayKey(r.starts_at)))];
  const isMakeup = motivo === "reposicao";

  return (
    <>
      <PageHeader
        title={isMakeup ? "Repor aula" : "Aula experimental"}
        description={
          isMakeup
            ? "Escolha uma aula com vaga e adicione o aluno marcando \"É reposição\"."
            : "Escolha uma aula com vaga e adicione a pessoa. Se for nova, cadastre antes em Pacientes."
        }
        back={{ href: "/agenda", label: "Hoje" }}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={22} />} title="Nenhuma aula com vaga nas próximas 2 semanas" text="Crie mais horários em Turmas ou aumente as vagas." />
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d}>
              <h2 className="mb-2 text-[15px] font-semibold capitalize">{formatDayLong(d)}</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {rows
                  .filter((r) => dayKey(r.starts_at) === d)
                  .map((r) => (
                    <Link key={r.id} href={`/agenda/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                      <span className="w-12 font-semibold tabular-nums">{formatTime(r.starts_at)}</span>
                      <span className="h-8 w-[3px] rounded-full" style={{ background: proColor(r.professionals?.color, r.professionals?.id) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.services?.name}</span>
                        <span className="text-sm text-muted">{r.professionals?.name}</span>
                      </span>
                      <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-sm font-medium text-ok">
                        {r.free} vaga{r.free === 1 ? "" : "s"}
                      </span>
                      <ChevronRight size={18} className="text-faint" />
                    </Link>
                  ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
