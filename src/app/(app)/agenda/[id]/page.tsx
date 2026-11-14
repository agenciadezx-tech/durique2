import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Repeat } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Alert, Avatar, Card, PageHeader, Section } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { AttendeeStatus } from "./status-buttons";
import { ChargeForm } from "./charge-form";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDayLong, formatTime, TZ, whatsappLink } from "@/lib/format";
import { addAttendee, cancelAppointment, removeAttendee, restoreAppointment } from "../actions";

type Attendee = {
  id: string;
  status: string;
  is_makeup: boolean;
  enrollment_id: string | null;
  package_id: string | null;
  patients: { id: string; name: string; phone: string | null } | null;
  patient_packages: { name: string; kind: string; total_sessions: number | null } | null;
};

export default async function SessaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const { nova } = await searchParams;
  const supabase = await createClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "*, services(name, kind, price_cents), professionals(name), recurring_series(id), appointment_attendees(id, status, is_makeup, enrollment_id, package_id, patients(id, name, phone), patient_packages(name, kind, total_sessions))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!appt) notFound();

  const service = appt.services as unknown as { name: string; kind: string; price_cents: number | null } | null;
  const pro = appt.professionals as unknown as { name: string } | null;
  const all = (appt.appointment_attendees as unknown as Attendee[]).sort((a, b) =>
    (a.patients?.name ?? "").localeCompare(b.patients?.name ?? ""),
  );
  const attendees = all.filter((t) => t.status !== "removido");
  const occupied = attendees.filter((t) => isActiveAttendee(t.status)).length;
  const free = appt.capacity - occupied;
  const canceled = appt.status === "cancelado";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(appt.starts_at));

  // Cobranças avulsas já lançadas nesta sessão
  const showFinance = ctx.role !== "profissional";
  const { data: charges } = showFinance && attendees.length
    ? await supabase.from("transactions").select("attendee_id, paid_on").in("attendee_id", attendees.map((t) => t.id))
    : { data: [] as { attendee_id: string | null; paid_on: string | null }[] };
  const chargedOf = new Map((charges ?? []).map((c) => [c.attendee_id, c.paid_on]));

  let available: { id: string; name: string }[] = [];
  if (ctx.canManageAgenda && !canceled && free > 0) {
    const inSession = new Set(all.map((t) => t.patients?.id));
    const { data } = await supabase
      .from("patients")
      .select("id, name")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("name")
      .limit(2000);
    available = (data ?? []).filter((p) => !inSession.has(p.id));
  }

  return (
    <>
      <PageHeader
        title={`${formatTime(appt.starts_at)} – ${formatTime(appt.ends_at)}`}
        description={`${formatDayLong(day)} · ${service?.name} com ${pro?.name}`}
        back={{ href: `/agenda?d=${day}`, label: "Agenda" }}
      />

      <div className="space-y-8">
        {nova && <Alert tone="ok">Sessão marcada!</Alert>}
        {canceled && <Alert tone="info">Esta sessão foi cancelada.</Alert>}
        {appt.series_id && !canceled && (
          <p className="-mt-3 flex items-center gap-2 text-sm text-muted">
            <Repeat size={16} /> Faz parte de um{" "}
            <Link href={`/horarios/${appt.series_id}`} className="font-medium text-accent hover:underline">
              horário fixo
            </Link>
          </p>
        )}

        <Section
          title={appt.capacity > 1 ? `Pacientes (${occupied}/${appt.capacity})` : "Paciente"}
          action={free <= 0 && appt.capacity > 1 ? <span className="text-sm font-medium text-warn">Lotado</span> : undefined}
        >
          {attendees.length ? (
            <ul className="space-y-3">
              {attendees.map((t) => {
                const wa = whatsappLink(t.patients?.phone);
                return (
                  <li key={t.id}>
                    <Card className="p-4">
                      <AttendeeStatus
                        attendeeId={t.id}
                        appointmentId={appt.id}
                        status={t.status}
                        canEdit={!canceled}
                        avatar={<Avatar name={t.patients?.name ?? "?"} />}
                        title={
                          <Link href={`/pacientes/${t.patients?.id}`} className="block truncate font-medium hover:underline">
                            {t.patients?.name}
                          </Link>
                        }
                        extra={
                          <>
                            {t.patient_packages && (
                              <span className="text-[13px] text-muted">{t.patient_packages.name}</span>
                            )}
                            {chargedOf.has(t.id) && (
                              <span className="text-[13px] text-muted">{chargedOf.get(t.id) ? "Avulsa paga ✓" : "Avulsa a receber"}</span>
                            )}
                            {t.is_makeup && <span className="text-[13px] text-muted">Reposição</span>}
                            {!t.enrollment_id && !t.is_makeup && appt.series_id && <span className="text-[13px] text-muted">Avulso</span>}
                          </>
                        }
                        trailing={
                          wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`WhatsApp de ${t.patients?.name}`}
                              className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-ok"
                            >
                              <MessageCircle size={20} />
                            </a>
                          )
                        }
                      />
                      {showFinance && !canceled && t.status === "presente" && !t.package_id && !chargedOf.has(t.id) && t.patients && (
                        <ChargeForm
                          attendeeId={t.id}
                          appointmentId={appt.id}
                          patientId={t.patients.id}
                          description={`${service?.name ?? "Sessão"} · ${day.slice(8, 10)}/${day.slice(5, 7)}`}
                          defaultCents={service?.price_cents ?? null}
                          dueDate={day}
                        />
                      )}
                      {ctx.canManageAgenda && !t.enrollment_id && !canceled && (
                        <form action={removeAttendee} className="mt-2 text-right">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="appointment_id" value={appt.id} />
                          <ConfirmSubmit size="sm" variant="ghost" question={`Tirar ${t.patients?.name} desta sessão?`}>
                            Tirar da sessão
                          </ConfirmSubmit>
                        </form>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card className="px-4 py-5 text-[15px] text-muted">Nenhum paciente nesta sessão.</Card>
          )}
          {!canceled && attendees.length > 0 && (
            <p className="text-[13px] text-faint">
              Toque de novo no botão marcado para desfazer. “Desmarcou” com menos de 12h de antecedência conta como em cima da hora.
            </p>
          )}
        </Section>

        {ctx.canManageAgenda && !canceled && free > 0 && (
          <Section title={appt.capacity > 1 ? "Adicionar à sessão" : "Escolher paciente"}>
            <Card className="p-5">
              <ActionForm action={addAttendee} resetOnSuccess>
                <input type="hidden" name="appointment_id" value={appt.id} />
                <PatientPicker key={occupied} patients={available} />
                {appt.capacity > 1 && (
                  <label className="flex items-center gap-2.5 text-[15px]">
                    <input type="checkbox" name="is_makeup" className="size-5 accent-[var(--color-accent)]" />
                    É reposição de aula
                  </label>
                )}
                <SubmitButton size="md" pendingText="Adicionando…">
                  Adicionar
                </SubmitButton>
              </ActionForm>
            </Card>
          </Section>
        )}

        {ctx.canManageAgenda && (
          <div className="border-t border-line pt-6">
            {canceled ? (
              <form action={restoreAppointment}>
                <input type="hidden" name="id" value={appt.id} />
                <SubmitButton variant="secondary" size="md" pendingText="Aguarde…">
                  Desfazer cancelamento
                </SubmitButton>
              </form>
            ) : (
              <form action={cancelAppointment}>
                <input type="hidden" name="id" value={appt.id} />
                <ConfirmSubmit question="Cancelar esta sessão? Os pacientes continuam no horário fixo para as próximas semanas.">
                  Cancelar esta sessão
                </ConfirmSubmit>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
