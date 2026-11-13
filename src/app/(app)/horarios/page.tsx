import Link from "next/link";
import { ChevronRight, Plus, Repeat } from "lucide-react";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Horários fixos" };

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ criados?: string; encerrado?: string }>;
}) {
  const ctx = await getContext();
  const { criados, encerrado } = await searchParams;
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
  const byDay = new Map<number, Row[]>();
  rows.forEach((r) => byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]));

  return (
    <>
      <PageHeader
        title="Horários fixos"
        description="Turmas e atendimentos que se repetem toda semana. A agenda é preenchida sozinha."
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

      {rows.length === 0 ? (
        <EmptyState
          icon={<Repeat size={22} />}
          title="Nenhum horário fixo ainda"
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
    </>
  );
}
