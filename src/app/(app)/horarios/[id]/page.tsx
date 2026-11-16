import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, UserMinus } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Alert, Avatar, Card, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, formatTimestampShort, todayISO, WEEKDAYS } from "@/lib/format";
import { endSeries, enroll, unenroll } from "../actions";

export default async function HorarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const { novo } = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const { data: s } = await supabase
    .from("recurring_series")
    .select("*, services(name, kind), professionals(name)")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const service = s.services as unknown as { name: string; kind: string } | null;
  const pro = s.professionals as unknown as { name: string } | null;

  const [{ data: enrollments }, { data: next }, { data: patients }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, starts_on, patients(id, name)")
      .eq("series_id", id)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order("created_at"),
    supabase
      .from("appointments")
      .select("id, starts_at")
      .eq("series_id", id)
      .eq("status", "agendado")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(4),
    ctx.canManageAgenda
      ? supabase.from("patients").select("id, name, phone").eq("clinic_id", ctx.clinicId).eq("active", true).order("name").limit(2000)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const enrolled = (enrollments ?? []).map((e) => ({ ...e, patient: e.patients as unknown as { id: string; name: string } }));
  const enrolledIds = new Set(enrolled.map((e) => e.patient.id));
  const available = (patients ?? []).filter((p) => !enrolledIds.has(p.id));
  const free = s.capacity - enrolled.length;

  return (
    <>
      <PageHeader
        title={`${WEEKDAYS[s.weekday]} · ${s.start_time.slice(0, 5)}`}
        description={`${service?.name} com ${pro?.name} · ${s.duration_min} min`}
        back={{ href: "/horarios", label: "Turmas" }}
      />

      <div className="space-y-8">
        {novo && <Alert tone="ok">Horário criado e lançado na agenda das próximas 8 semanas. Agora adicione os pacientes fixos.</Alert>}
        {!s.active && <Alert tone="info">Este horário foi encerrado.</Alert>}

        <Section
          title={`Pacientes fixos (${enrolled.length}/${s.capacity})`}
          action={<span className={"text-sm font-medium " + (free > 0 ? "text-accent" : "text-warn")}>{free > 0 ? `${free} vaga${free === 1 ? "" : "s"} livre${free === 1 ? "" : "s"}` : "Lotado"}</span>}
        >
          {enrolled.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {enrolled.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={e.patient.name} />
                  <Link href={`/pacientes/${e.patient.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-medium">{e.patient.name}</p>
                    <p className="text-sm text-muted">Desde {formatDateShort(e.starts_on)}</p>
                  </Link>
                  {ctx.canManageAgenda && s.active && (
                    <form action={unenroll}>
                      <input type="hidden" name="enrollment_id" value={e.id} />
                      <input type="hidden" name="series_id" value={s.id} />
                      <ConfirmSubmit
                        size="sm"
                        variant="ghost"
                        question={`Tirar ${e.patient.name} deste horário? Ele(a) sai das próximas sessões, mas o histórico fica guardado.`}
                      >
                        <UserMinus size={16} /> Tirar
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              ))}
            </Card>
          ) : (
            <Card className="px-4 py-5 text-[15px] text-muted">Ninguém neste horário ainda.</Card>
          )}

          {ctx.canManageAgenda && s.active && free > 0 && (
            <Card className="p-5">
              <ActionForm action={enroll} resetOnSuccess>
                <input type="hidden" name="series_id" value={s.id} />
                <p className="font-medium">Adicionar paciente fixo</p>
                <PatientPicker key={enrolled.length} patients={available} />
                <SubmitButton size="md" pendingText="Adicionando…">
                  Adicionar a este horário
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
        </Section>

        <Section title="Próximas sessões">
          {next?.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {next.map((a) => (
                <Link key={a.id} href={`/agenda/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                  <CalendarClock size={18} className="text-accent" />
                  <span className="capitalize">{formatTimestampShort(a.starts_at)}</span>
                </Link>
              ))}
            </Card>
          ) : (
            <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma sessão futura.</Card>
          )}
        </Section>

        {ctx.canManageAgenda && s.active && (
          <form action={endSeries} className="border-t border-line pt-6">
            <input type="hidden" name="series_id" value={s.id} />
            <ConfirmSubmit question="Encerrar este horário? As próximas sessões serão canceladas. O histórico fica guardado.">
              Encerrar este horário
            </ConfirmSubmit>
            <p className="mt-2 text-[13px] text-faint">Use quando a turma deixar de existir. Para tirar só um aluno, use “Tirar”.</p>
          </form>
        )}
      </div>
    </>
  );
}
