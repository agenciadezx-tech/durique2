import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CheckCheck, MessageCircle, NotebookPen, Plus, Repeat, UserRound, Users, X } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Alert, Avatar, Badge, buttonClass, Card, cx, PageHeader, Section } from "@/components/ui";
import { isActiveAttendee } from "@/components/status";
import { AttendeeStatus } from "./status-buttons";
import { ChargeForm } from "./charge-form";
import { getContext } from "@/lib/context";
import { EvolutionForm } from "./evolution-form";
import { createClient } from "@/lib/supabase/server";
import { formatDayLong, formatTime, formatTimestampShort, TZ, whatsappLink } from "@/lib/format";
import { MoveButton } from "../move";
import { ConcludeButton } from "./conclude";
import { OpenOnHash } from "./open-on-hash";
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
  patients: { id: string; name: string; phone: string | null; access_via: string | null } | null;
  patient_packages: { name: string; kind: string; total_sessions: number | null } | null;
};

/** Detalhe da sessão. Usado na página própria (celular) e no meio da tela Hoje (computador, `embedded`). */
export async function AppointmentDetail({ id, nova, embedded }: { id: string; nova?: boolean; embedded?: boolean }) {
  const ctx = await getContext();
  const supabase = await createClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "*, services(name, kind, price_cents), professionals(name), recurring_series(id, name), appointment_attendees(id, status, is_makeup, booked_online, enrollment_id, package_id, patients(id, name, phone, access_via), patient_packages(name, kind, total_sessions))",
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
  const { data: endingData } = attendees.length
    ? await supabase
        .from("packages_ending")
        .select("patient_id, sessions_left")
        .in("patient_id", attendees.map((t) => t.patients?.id).filter(Boolean) as string[])
    : { data: [] as { patient_id: string | null; sessions_left: number | null }[] };
  const endingOf = new Map((endingData ?? []).map((e) => [e.patient_id, e.sessions_left]));

  // Cobranças avulsas já lançadas nesta sessão
  // Evolução da aula: admin ou o profissional da sessão
  const canEvolve = !canceled && (ctx.isAdmin || (!!ctx.professionalId && ctx.professionalId === appt.professional_id));
  const [{ data: sessEvo }, { data: patEvo }] = canEvolve
    ? await Promise.all([
        supabase.from("session_evolutions").select("level, notes, updated_at").eq("appointment_id", appt.id).maybeSingle(),
        supabase.from("patient_evolutions").select("patient_id, level, note").eq("appointment_id", appt.id),
      ])
    : [{ data: null }, { data: [] }];
  const sessLevel = sessEvo?.level ?? null;
  const anyPresent = attendees.some((t) => t.status === "presente");
  const evoPeople = attendees
    .filter((t) => (anyPresent ? t.status === "presente" : ["agendado", "confirmado"].includes(t.status)) && t.patients)
    .map((t) => {
      const pe = (patEvo ?? []).find((x) => x.patient_id === t.patients!.id);
      return {
        patient_id: t.patients!.id,
        name: t.patients!.name,
        level: pe?.level != null && pe.level !== sessLevel ? pe.level : null,
        note: pe?.note ?? "",
      };
    });
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
      .select("id, name, phone")
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

  const isClass = appt.capacity > 1 || service?.kind === "turma";
  const seriesName = (appt.recurring_series as unknown as { id: string; name: string | null } | null)?.name ?? null;
  const main = !isClass ? attendees.find((t) => isActiveAttendee(t.status) || t.status === "presente" || t.status === "falta") ?? attendees[0] : null;
  const title = isClass ? (seriesName ?? service?.name ?? "Aula") : (main?.patients?.name ?? service?.name ?? "Sessão");
  const dayShort = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })
    .format(new Date(appt.starts_at))
    .replace(/\./g, "");
  const meta = `${dayShort.charAt(0).toUpperCase()}${dayShort.slice(1)} · ${formatTime(appt.starts_at)}–${formatTime(appt.ends_at)} · ${
    isClass ? `Turma · ${occupied}/${appt.capacity} ocupadas` : (service?.name ?? "")
  }`;
  const { data: recs } =
    main && ctx.canSeeClinical ? await supabase.from("clinical_records").select("id").eq("attendee_id", main.id).limit(1) : { data: [] as { id: string }[] };
  const nowMs = Date.now();
  const ended = Date.parse(appt.ends_at) < nowMs;
  const pendingPeople = attendees.filter((t) => t.status === "agendado" || t.status === "confirmado");
  const cameCount = attendees.filter((t) => t.status === "presente").length;
  const missedCount = attendees.filter((t) => t.status === "falta").length;
  const concluded = !canceled && attendees.length > 0 && pendingPeople.length === 0 && cameCount + missedCount > 0;
  const canConclude = nowMs >= Date.parse(appt.starts_at) - 30 * 60e3;
  const situation = canceled
    ? { l: "Cancelada", c: "bg-bad-soft text-bad" }
    : concluded
      ? { l: "Concluída", c: "bg-ok-soft text-ok" }
      : nowMs >= Date.parse(appt.starts_at) && !ended
        ? { l: "Acontecendo agora", c: "bg-info-soft text-info" }
        : ended && pendingPeople.length
          ? { l: "Falta concluir", c: "bg-warn-soft text-warn" }
          : { l: "Agendada", c: "bg-hover text-muted" };
  const callDone = isClass && attendees.length > 0 && attendees.every((t) => !["agendado", "confirmado"].includes(t.status));

  return (
    <>
      {embedded ? (
        <header className="relative isolate mb-6 -mt-10 flex items-center gap-4 pt-6 pb-5 before:absolute before:inset-y-0 before:-inset-x-[100vmax] before:-z-10 before:border-b before:border-line before:bg-surface">
          {isClass ? (
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-chart-out/15 text-[#a85a17]">
              <Users size={22} />
            </span>
          ) : (
            <Avatar name={title} />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[22px] leading-tight font-semibold tracking-tight">{title}</h2>
            <p className="truncate text-[15px] text-muted">{meta}</p>
          </div>
          <Link href={`/agenda?d=${day}`} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink">
            <X size={18} />
          </Link>
        </header>
      ) : (
        <PageHeader title={title} description={meta} back={{ href: `/agenda?d=${day}`, label: "Agenda" }} />
      )}

      <div className="space-y-6">
        {nova && <Alert tone="ok">Sessão marcada!</Alert>}

        {/* Resumo da sessão */}
        <Card className="overflow-hidden">
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>div]:border-line [&>div:nth-child(-n+2)]:border-b sm:[&>div:nth-child(-n+2)]:border-b-0 [&>div:nth-child(odd)]:border-r sm:[&>div:nth-child(odd)]:border-r-0">
            <div className="px-4 py-3">
              <dt className="text-[12px] font-semibold tracking-wide text-muted uppercase">Situação</dt>
              <dd className="mt-1">
                <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold", situation.c)}>
                  <span className="size-1.5 rounded-full bg-current" /> {situation.l}
                </span>
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[12px] font-semibold tracking-wide text-muted uppercase">Horário</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatTime(appt.starts_at)}–{formatTime(appt.ends_at)}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[12px] font-semibold tracking-wide text-muted uppercase">{isClass ? "Professor" : "Profissional"}</dt>
              <dd className="mt-1 truncate font-semibold">{pro?.name ?? "—"}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[12px] font-semibold tracking-wide text-muted uppercase">{isClass ? "Vagas" : "Serviço"}</dt>
              {isClass ? (
                <dd className="mt-1">
                  <span className={cx("font-semibold tabular-nums", free <= 0 && "text-warn")}>
                    {occupied}/{appt.capacity}
                  </span>
                  <span className="ml-1 text-[13px] text-muted">{free <= 0 ? "lotada" : `${free} livre${free === 1 ? "" : "s"}`}</span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hover">
                    <span className="block h-full rounded-full bg-chart-out" style={{ width: `${Math.min(100, (occupied / appt.capacity) * 100)}%` }} />
                  </span>
                </dd>
              ) : (
                <dd className="mt-1 truncate font-semibold">{service?.name ?? "—"}</dd>
              )}
            </div>
          </dl>

          {!canceled && (
            <div className="space-y-3 border-t border-line bg-bg/50 p-4">
              {pendingPeople.length > 0 && canConclude ? (
                <ConcludeButton
                  appointmentId={appt.id}
                  isClass={isClass}
                  people={pendingPeople.map((t) => ({ id: t.id, name: t.patients?.name ?? "Paciente", confirmed: t.status === "confirmado" }))}
                />
              ) : concluded ? (
                <p className="flex flex-wrap items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-[15px] text-ok">
                  <CheckCheck size={19} className="shrink-0" />
                  <span className="font-semibold">{isClass ? "Aula concluída" : "Atendimento concluído"}</span>
                  <span>
                    · {cameCount} {cameCount === 1 ? "veio" : "vieram"}
                    {missedCount > 0 && ` · ${missedCount} faltou${missedCount === 1 ? "" : "aram"}`}
                  </span>
                </p>
              ) : pendingPeople.length > 0 ? (
                <p className="text-[14px] text-muted">O botão “Concluir” aparece meia hora antes do horário.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {isClass && appt.series_id && ctx.canManageAgenda && (
                  <Link href={`/horarios/${appt.series_id}`} className={buttonClass("secondary", "sm")}>
                    <Repeat size={16} /> Turma e alunos fixos
                  </Link>
                )}
                {!isClass && main?.patients && (
                  <Link href={`/pacientes/${main.patients.id}`} className={buttonClass("secondary", "sm")}>
                    <UserRound size={16} /> Abrir ficha
                  </Link>
                )}
                {isClass && canEvolve && evoPeople.length > 0 && (
                  <a href="#evolucao" className={buttonClass("secondary", "sm")}>
                    <NotebookPen size={16} /> {sessEvo ? "Evolução feita ✓" : "Fazer evolução"}
                  </a>
                )}
                {!isClass && main?.patients && ctx.canSeeClinical && ctx.professionalId && (
                  <Link href={`/pacientes/${main.patients.id}/prontuario/novo?tipo=evolucao&sessao=${main.id}`} className={buttonClass("secondary", "sm")}>
                    <NotebookPen size={16} /> {(recs ?? []).length ? "Evolução feita ✓" : "Realizar evolução"}
                  </Link>
                )}
                {ctx.canManageAgenda && (
                  <MoveButton
                    appt={{
                      id: appt.id,
                      title: (isClass ? seriesName : main?.patients?.name) ?? service?.name ?? "Sessão",
                      date: day,
                      time: formatTime(appt.starts_at),
                      people: occupied,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </Card>
        {canceled && <Alert tone="info">Esta sessão foi cancelada.</Alert>}

        <Section
          id="chamada"
          title={isClass ? `Chamada · ${occupied}/${appt.capacity} vagas` : "Presença"}
          action={
            isClass ? (
              callDone ? (
                <Badge tone="ok">
                  <Check size={13} /> Chamada feita
                </Badge>
              ) : free <= 0 ? (
                <span className="text-sm font-medium text-warn">Lotado</span>
              ) : ctx.canManageAgenda && !canceled ? (
                <a href="#adicionar" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-accent hover:bg-hover">
                  <Plus size={16} /> Aluno
                </a>
              ) : undefined
            ) : undefined
          }
        >
          {attendees.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {attendees.map((t) => {
                const wa = whatsappLink(t.patients?.phone);
                return (
                  <li key={t.id} className="p-4">
                    <div>
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
                            {t.patients?.access_via && (
                              <span className="text-[13px] font-medium text-info">
                                {t.patients.access_via === "wellhub" ? "Wellhub" : "TotalPass"}: validar check-in no app
                              </span>
                            )}
                            {t.patients && endingOf.has(t.patients.id) && (
                              <Link href="/whatsapp?aba=renovacoes" className="text-[13px] font-medium text-warn hover:underline">
                                {(endingOf.get(t.patients.id) ?? 1) <= 0
                                  ? "Pacote acabou: oferecer renovação"
                                  : endingOf.get(t.patients.id) != null
                                    ? `Pacote: falta${endingOf.get(t.patients.id) === 1 ? "" : "m"} ${endingOf.get(t.patients.id)}`
                                    : "Pacote vencendo"}
                              </Link>
                            )}
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
                    </div>
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

        {canEvolve && evoPeople.length > 0 && (
          <Section id="evolucao" title="Evolução">
            <EvolutionForm
              appointmentId={appt.id}
              turma={appt.capacity > 1}
              initialLevel={sessLevel}
              initialNotes={sessEvo?.notes ?? ""}
              people={evoPeople}
              savedAt={sessEvo ? formatTimestampShort(sessEvo.updated_at) : null}
            />
          </Section>
        )}

        <OpenOnHash id="adicionar" />
        {ctx.canManageAgenda && !canceled && free > 0 && (
          <details id="adicionar" open={attendees.length === 0} className="group scroll-mt-24 rounded-2xl border border-line bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-accent [&::-webkit-details-marker]:hidden">
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft">
                <Plus size={18} />
              </span>
              {appt.capacity > 1 ? "Adicionar aluno nesta aula" : "Escolher paciente"}
              <span className="ml-auto text-sm font-normal text-muted">{free} vaga{free === 1 ? "" : "s"}</span>
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={addAttendee} resetOnSuccess>
                <input type="hidden" name="appointment_id" value={appt.id} />
                <PatientPicker key={occupied} patients={available} allowNew />
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
            </div>
          </details>
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
                <ConfirmSubmit
                  question={isClass ? "Cancelar esta aula? Os alunos continuam na turma para as próximas semanas." : "Excluir este agendamento? O horário volta a ficar livre."}
                >
                  {isClass ? "Cancelar esta aula" : "Excluir agendamento"}
                </ConfirmSubmit>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
