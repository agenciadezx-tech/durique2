import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, NotebookPen, Repeat } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Alert, Avatar, Card, PageHeader, Section } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { AttendeeStatus } from "./status-buttons";
import { ChargeForm } from "./charge-form";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDayLong, formatTime, TZ, whatsappLink } from "@/lib/format";
import { addAttendee, addToWaitlist, cancelAppointment, cancelWaitlist, fitFromWaitlist, removeAttendee, restoreAppointment } from "../actions";
import { WaSendButton } from "@/components/wa-send";
import { firstName } from "@/lib/messages";

type Attendee = {
  id: string;
  status: string;
  is_makeup: boolean;
  booked_online: boolean;
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
      "*, services(name, kind, price_cents), professionals(name), recurring_series(id), appointment_attendees(id, status, is_makeup, booked_online, enrollment_id, package_id, patients(id, name, phone), patient_packages(name, kind, total_sessions))",
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
  if (ctx.canManageAgenda && !canceled) {
    const inSession = new Set(all.map((t) => t.patients?.id));
    const { data } = await supabase
      .from("patients")
      .select("id, name")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("name")
      .limit(2000);
    available = (data ?? []).filter((p) => !inSession.has(p.id));
    // Quem tem reposição disponível aparece primeiro e marcado
    const { data: credits } = await supabase
      .from("makeup_credits")
      .select("patient_id")
      .eq("clinic_id", ctx.clinicId)
      .eq("status", "disponivel")
      .gte("expires_on", day);
    const withCredit = new Map<string, number>();
    (credits ?? []).forEach((c) => withCredit.set(c.patient_id, (withCredit.get(c.patient_id) ?? 0) + 1));
    available = available
      .map((p) => (withCredit.has(p.id) ? { ...p, name: `${p.name} · tem reposição` } : p))
      .sort((a, b) => Number(withCredit.has(b.id)) - Number(withCredit.has(a.id)));
  }
  const { data: waitData } = ctx.canManageAgenda
    ? await supabase
        .from("waitlist")
        .select("id, notes, patients(id, name, phone)")
        .eq("appointment_id", appt.id)
        .eq("status", "aguardando")
        .order("created_at")
    : { data: [] };
  const waiting = (waitData ?? []) as unknown as { id: string; notes: string | null; patients: { id: string; name: string; phone: string | null } | null }[];

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
                            {t.booked_online && <span className="text-[13px] text-info">Marcou pelo link</span>}
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
                      {ctx.professionalId && !canceled && t.status === "presente" && t.patients && (
                        <Link
                          href={`/pacientes/${t.patients.id}/prontuario/novo?tipo=evolucao&sessao=${t.id}`}
                          className="mt-2 mr-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                        >
                          <NotebookPen size={16} /> Escrever evolução
                        </Link>
                      )}
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

        {ctx.canManageAgenda && !canceled && (waiting.length > 0 || free <= 0) && (
          <Section title={free > 0 && waiting.length > 0 ? "Abriu vaga! Lista de espera" : "Lista de espera"}>
            {waiting.length > 0 && (
              <Card className={"divide-y divide-line overflow-hidden " + (free > 0 ? "border-ok/40" : "")}>
                {waiting.map((w, i) => (
                  <div key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hover text-sm font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1 font-medium">{w.patients?.name}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {free > 0 && w.patients?.phone && (
                        <WaSendButton
                          compact
                          phone={w.patients.phone}
                          kind="outro"
                          patientId={w.patients.id}
                          body={`Olá, ${firstName(w.patients.name)}! Abriu uma vaga em ${service?.name} ${formatDayLong(day).toLowerCase()} às ${formatTime(appt.starts_at)}, na ${ctx.clinicName}. Quer que eu reserve para você?`}
                        />
                      )}
                      {free > 0 && (
                        <form action={fitFromWaitlist}>
                          <input type="hidden" name="id" value={w.id} />
                          <input type="hidden" name="appointment_id" value={appt.id} />
                          <SubmitButton size="sm" pendingText="…">
                            Encaixar
                          </SubmitButton>
                        </form>
                      )}
                      <form action={cancelWaitlist}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="appointment_id" value={appt.id} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…">
                          Tirar
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </Card>
            )}
            {free <= 0 && (
              <Card className="p-5">
                <ActionForm action={addToWaitlist} resetOnSuccess>
                  <input type="hidden" name="appointment_id" value={appt.id} />
                  <p className="text-[15px] text-muted">Sessão lotada. Coloque o paciente na fila: quando alguém desmarcar, ele aparece aqui para encaixar.</p>
                  <PatientPicker key={`w${waiting.length}`} patients={available.filter((p) => !waiting.some((w) => w.patients?.id === p.id))} />
                  <SubmitButton size="md" variant="secondary" pendingText="Adicionando…">
                    Colocar na lista de espera
                  </SubmitButton>
                </ActionForm>
              </Card>
            )}
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
