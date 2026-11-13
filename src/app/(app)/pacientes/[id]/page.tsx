import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, MessageCircle, Repeat } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, buttonClass, Card, PageHeader, Section } from "@/components/ui";
import { AttendeeBadge } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatTimestampShort, whatsappLink, WEEKDAYS } from "@/lib/format";
import { setPatientActive, updatePatient } from "../actions";
import { PatientFields } from "../patient-fields";

export default async function PacientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const { salvo } = await searchParams;
  const supabase = await createClient();

  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (!patient) notFound();

  const [{ data: enrollments }, { data: upcoming }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, ends_on, recurring_series(id, weekday, start_time, active, services(name), professionals(name))")
      .eq("patient_id", id)
      .or(`ends_on.is.null,ends_on.gte.${new Date().toISOString().slice(0, 10)}`),
    supabase
      .from("appointment_attendees")
      .select("id, status, appointments!inner(id, starts_at, status, services(name))")
      .eq("patient_id", id)
      .gte("appointments.starts_at", new Date().toISOString())
      .eq("appointments.status", "agendado")
      .not("status", "eq", "removido")
      .order("starts_at", { referencedTable: "appointments" })
      .limit(8),
  ]);

  type Series = { id: string; weekday: number; start_time: string; active: boolean; services: { name: string } | null; professionals: { name: string } | null };
  type Appt = { id: string; starts_at: string; services: { name: string } | null };
  const series = (enrollments ?? [])
    .map((e) => e.recurring_series as unknown as Series | null)
    .filter((s): s is Series => !!s && s.active);
  const sessions = (upcoming ?? [])
    .map((u) => ({ ...u, appt: u.appointments as unknown as Appt }))
    .sort((a, b) => a.appt.starts_at.localeCompare(b.appt.starts_at));
  const wa = whatsappLink(patient.phone);

  return (
    <>
      <PageHeader
        title={patient.name}
        description={!patient.active ? <Badge>Arquivado</Badge> : undefined}
        back={{ href: "/pacientes", label: "Pacientes" }}
        action={
          wa && (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle size={18} /> WhatsApp
            </a>
          )
        }
      />

      <div className="space-y-8">
        {salvo && <Alert tone="ok">Paciente cadastrado!</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Horários fixos">
            {series.length ? (
              <Card className="divide-y divide-line">
                {series.map((s) => (
                  <Link key={s.id} href={`/horarios/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                    <Repeat size={18} className="text-accent" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {WEEKDAYS[s.weekday]} · {s.start_time.slice(0, 5)}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {s.services?.name} com {s.professionals?.name}
                      </p>
                    </div>
                  </Link>
                ))}
              </Card>
            ) : (
              <Card className="px-4 py-5 text-[15px] text-muted">
                Sem horário fixo.{" "}
                {ctx.canManageAgenda && (
                  <Link href="/horarios" className="font-medium text-accent hover:underline">
                    Colocar numa turma
                  </Link>
                )}
              </Card>
            )}
          </Section>

          <Section title="Próximas sessões">
            {sessions.length ? (
              <Card className="divide-y divide-line">
                {sessions.map((s) => (
                  <Link key={s.id} href={`/agenda/${s.appt.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-hover">
                    <div className="min-w-0">
                      <p className="font-medium capitalize">{formatTimestampShort(s.appt.starts_at)}</p>
                      <p className="truncate text-sm text-muted">{s.appt.services?.name}</p>
                    </div>
                    <AttendeeBadge status={s.status} />
                  </Link>
                ))}
              </Card>
            ) : (
              <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma sessão marcada.</Card>
            )}
          </Section>
        </div>

        <Section title="Dados do paciente">
          <Card className="p-5 sm:p-7">
            <ActionForm action={updatePatient}>
              <input type="hidden" name="id" value={patient.id} />
              <PatientFields patient={patient} readOnly={!ctx.canManageAgenda} />
              {ctx.canManageAgenda && <SubmitButton>Salvar alterações</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>

        {ctx.canManageAgenda && (
          <form action={setPatientActive}>
            <input type="hidden" name="id" value={patient.id} />
            <input type="hidden" name="active" value={String(!patient.active)} />
            <SubmitButton variant="ghost" size="md" pendingText="Aguarde…" className="text-muted">
              {patient.active ? (
                <>
                  <Archive size={18} /> Arquivar paciente
                </>
              ) : (
                <>
                  <ArchiveRestore size={18} /> Reativar paciente
                </>
              )}
            </SubmitButton>
            {patient.active && (
              <p className="mt-1 px-4 text-[13px] text-faint">O histórico é mantido. Dá para reativar quando quiser.</p>
            )}
          </form>
        )}
      </div>
    </>
  );
}
