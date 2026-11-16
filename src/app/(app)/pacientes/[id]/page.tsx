import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ChevronRight, Dumbbell, ExternalLink, Smartphone, FileSignature, Lock, MessageCircle, Package, Plus, Repeat } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PayButton } from "@/components/finance";
import { WaSendButton } from "@/components/wa-send";
import { firstName, renderTemplate } from "@/lib/messages";
import { Alert, Badge, buttonClass, Card, cx, Field, Input, LinkButton, PageHeader, Section, Select } from "@/components/ui";
import { AttendeeBadge } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatDateShort, formatMoney, formatTimestampShort, PAY_LABEL, todayISO, whatsappLink, WEEKDAYS } from "@/lib/format";
import { createDocument, freezePackage, setPackageStatus, setPatientActive, updatePatient } from "../actions";
import { PatientFields } from "../patient-fields";

export default async function PacientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; vendido?: string }>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const { salvo, vendido } = await searchParams;
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
  const today = todayISO();

  // Pacotes/planos e parcelas (quem não tem acesso ao financeiro recebe lista vazia pela RLS)
  const [{ data: packages }, { data: txs }] = await Promise.all([
    supabase
      .from("patient_packages")
      .select("id, name, kind, total_sessions, sessions_per_week, price_cents, starts_on, expires_on, status, created_at, frozen_from, frozen_until")
      .eq("patient_id", id)
      .order("status")
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("id, description, amount_cents, due_date, paid_on, payment_method")
      .eq("patient_id", id)
      .eq("type", "receita")
      .order("due_date", { ascending: true })
      .limit(60),
  ]);
  const pkgIds = (packages ?? []).map((p) => p.id);
  const { data: usage } = pkgIds.length
    ? await supabase.from("package_usage").select("package_id, used").in("package_id", pkgIds)
    : { data: [] as { package_id: string; used: number }[] };
  const usedOf = new Map((usage ?? []).map((u) => [u.package_id, u.used]));
  const open = (txs ?? []).filter((t) => !t.paid_on);
  const paid = (txs ?? []).filter((t) => t.paid_on).slice(-5).reverse();
  const openTotal = open.reduce((a, t) => a + t.amount_cents, 0);
  const showFinance = ctx.role !== "profissional";
  const hh = await headers();
  const portalUrl = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}/p/${patient.portal_token}`;
  const { data: credits } = ctx.canManageAgenda
    ? await supabase.from("makeup_credits").select("expires_on").eq("patient_id", id).eq("status", "disponivel").gte("expires_on", today).order("expires_on")
    : { data: [] as { expires_on: string }[] };
  const [{ data: docs }, { data: templates }, { data: lastRec }, { data: plans }] = await Promise.all([
    supabase.from("patient_documents").select("id, title, status, signed_at, created_at").eq("patient_id", id).neq("status", "cancelado").order("created_at", { ascending: false }),
    supabase.from("document_templates").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    ctx.canSeeClinical
      ? supabase.from("clinical_records").select("record_date, kind").eq("patient_id", id).neq("kind", "adendo").order("record_date", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null as { record_date: string; kind: string } | null }),
    ctx.canSeeClinical
      ? supabase.from("exercise_plans").select("id, exercise_logs(done_on)").eq("patient_id", id).eq("active", true)
      : Promise.resolve({ data: [] as { id: string; exercise_logs: { done_on: string }[] }[] }),
  ]);
  const { data: waSettings } = await supabase.from("whatsapp_settings").select("tpl_renovacao").eq("clinic_id", ctx.clinicId).maybeSingle();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const doneWeek = new Set((plans ?? []).flatMap((p) => p.exercise_logs.filter((l) => l.done_on > weekAgo).map((l) => l.done_on))).size;

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
        {vendido && <Alert tone="ok">Venda registrada! As parcelas já estão em Contas a receber.</Alert>}
        {credits && credits.length > 0 && (
          <Alert tone="info">
            {credits.length} reposição{credits.length === 1 ? "" : "ões"} disponível{credits.length === 1 ? "" : "is"} · a primeira vence em{" "}
            {formatDateShort(credits[0].expires_on)}. Para usar, adicione o paciente numa aula marcando “É reposição de aula”.
          </Alert>
        )}

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

        {ctx.canManageAgenda && patient.active && (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-info-soft text-info">
              <Smartphone size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Link do aluno</span>
              <span className="text-sm text-muted">Ele confirma, desmarca, repõe aulas e assina termos pelo celular, sem instalar nada.</span>
            </span>
            <div className="flex w-full gap-2 sm:w-auto">
              {patient.phone && (
                <WaSendButton
                  phone={patient.phone}
                  kind="outro"
                  patientId={patient.id}
                  label="Enviar link"
                  body={`Olá, ${firstName(patient.name)}! Este é o seu link da ${ctx.clinicName} para ver suas aulas, confirmar, desmarcar e repor horários: ${portalUrl}`}
                />
              )}
              <a href={portalUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
                <ExternalLink size={16} /> Ver
              </a>
            </div>
          </Card>
        )}

        {ctx.canSeeClinical && (
          <Link href={`/pacientes/${patient.id}/prontuario`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-colors hover:border-faint sm:p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Lock size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Prontuário</span>
                <span className="text-sm text-muted">
                  {lastRec ? `Último registro: ${lastRec.kind === "avaliacao" ? "avaliação" : "evolução"} em ${formatDateShort(lastRec.record_date)}` : "Avaliação, evoluções e escalas"}
                </span>
              </span>
              <ChevronRight size={20} className="text-faint" />
            </Card>
          </Link>
        )}

        {ctx.canSeeClinical && (
          <Link href={`/pacientes/${patient.id}/exercicios`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-colors hover:border-faint sm:p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Dumbbell size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Exercícios para casa</span>
                <span className="text-sm text-muted">
                  {(plans ?? []).length === 0 ? "Passe exercícios com vídeo pelo link do aluno" : `Fez em ${doneWeek} dos últimos 7 dias`}
                </span>
              </span>
              <ChevronRight size={20} className="text-faint" />
            </Card>
          </Link>
        )}

        {ctx.role !== "financeiro" && (
          <Section title="Termos e contratos">
            {docs && docs.length > 0 && (
              <Card className="divide-y divide-line overflow-hidden">
                {docs.map((d) => (
                  <Link key={d.id} href={`/pacientes/${patient.id}/documentos/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                    <FileSignature size={18} className={d.status === "assinado" ? "text-ok" : "text-warn"} />
                    <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                    {d.status === "assinado" ? (
                      <Badge tone="ok">Assinado {formatDateShort(d.signed_at!.slice(0, 10))}</Badge>
                    ) : (
                      <Badge tone="warn">Aguardando</Badge>
                    )}
                  </Link>
                ))}
              </Card>
            )}
            {templates && templates.length > 0 && (
              <form action={createDocument} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="patient_id" value={patient.id} />
                <Select name="template_id" defaultValue={templates[0].id} aria-label="Modelo de documento" className="sm:flex-1">
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <SubmitButton size="lg" variant="secondary" pendingText="Gerando…">
                  <FileSignature size={18} /> Gerar para assinar
                </SubmitButton>
              </form>
            )}
          </Section>
        )}

        {showFinance && (
          <Section
            title="Pacotes e planos"
            action={
              ctx.canManageAgenda && (
                <LinkButton href={`/pacientes/${patient.id}/vender`} size="sm" variant="secondary">
                  <Plus size={16} /> Vender
                </LinkButton>
              )
            }
          >
            {packages?.length ? (
              <div className="space-y-3">
                {packages.map((p) => {
                  const used = usedOf.get(p.id) ?? 0;
                  const expired = p.expires_on && p.expires_on < today;
                  const done = p.total_sessions != null && used >= p.total_sessions;
                  const active = p.status === "ativo" && !expired && !done;
                  const pct = p.total_sessions ? Math.min(100, Math.round((used / p.total_sessions) * 100)) : 0;
                  const left = p.total_sessions ? p.total_sessions - used : null;
                  return (
                    <Card key={p.id} className={cx("p-4", !active && "opacity-70")}>
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                          {p.kind === "plano" ? <Repeat size={18} /> : <Package size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-sm text-muted">
                            {p.kind === "plano"
                              ? `${formatMoney(p.price_cents)}/mês · desde ${formatDateShort(p.starts_on)}`
                              : `${formatMoney(p.price_cents)} · ${p.expires_on ? `válido até ${formatDateShort(p.expires_on)}` : "sem validade"}`}
                          </p>
                        </div>
                        {active ? (
                          <Badge tone={left != null && left <= 2 ? "warn" : "ok"}>
                            {p.kind === "plano" ? "Ativo" : `${left} ${left === 1 ? "sessão restante" : "sessões restantes"}`}
                          </Badge>
                        ) : (
                          <Badge>{p.status === "cancelado" ? "Cancelado" : done ? "Concluído" : expired ? "Vencido" : "Encerrado"}</Badge>
                        )}
                      </div>
                      {p.total_sessions != null && (
                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={p.total_sessions} aria-label="Sessões usadas">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1.5 text-[13px] text-muted">
                            {used} de {p.total_sessions} sessões usadas
                          </p>
                        </div>
                      )}
                      {active && p.kind === "pacote" && ((left != null && left <= 2) || (p.expires_on && p.expires_on <= addDaysISO(today, 7))) && (
                        <div className="mt-3 rounded-xl bg-warn-soft px-3 py-3">
                          <p className="text-sm font-medium text-warn">
                            {left != null && left <= 2
                              ? `Pacote acabando: ${left === 1 ? "falta 1 sessão" : `faltam ${left} sessões`}.`
                              : `Pacote vence em ${formatDateShort(p.expires_on)}.`}{" "}
                            Hora de oferecer a renovação.
                          </p>
                          {ctx.canManageAgenda && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {patient.phone && (
                                <WaSendButton
                                  phone={patient.phone}
                                  kind="renovacao"
                                  patientId={patient.id}
                                  packageId={p.id}
                                  label="Avisar no WhatsApp"
                                  body={renderTemplate(waSettings?.tpl_renovacao ?? "", {
                                    nome: firstName(patient.name),
                                    restantes: left ?? "",
                                    pacote: p.name,
                                    validade: p.expires_on ? formatDateShort(p.expires_on) : "",
                                    clinica: ctx.clinicName,
                                  })}
                                />
                              )}
                              <LinkButton href={`/pacientes/${patient.id}/vender`} size="sm" variant="secondary">
                                Vender renovação
                              </LinkButton>
                            </div>
                          )}
                        </div>
                      )}
                      {p.frozen_until && p.frozen_until >= today && (
                        <p className="mt-2 text-sm font-medium text-info">
                          Congelado de {formatDateShort(p.frozen_from)} a {formatDateShort(p.frozen_until)}
                        </p>
                      )}
                      {ctx.canManageAgenda && active && !(p.frozen_until && p.frozen_until >= today) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-medium text-accent">Congelar (férias, viagem, lesão)</summary>
                          <div className="mt-3">
                            <ActionForm action={freezePackage}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="patient_id" value={patient.id} />
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="De">
                                  <Input name="from" type="date" defaultValue={today} required />
                                </Field>
                                <Field label="Até">
                                  <Input name="until" type="date" required />
                                </Field>
                              </div>
                              <SubmitButton size="md" variant="secondary" pendingText="Congelando…">
                                Congelar
                              </SubmitButton>
                            </ActionForm>
                          </div>
                        </details>
                      )}
                      {ctx.canManageAgenda && p.status === "ativo" && (
                        <form action={setPackageStatus} className="mt-2 text-right">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="patient_id" value={patient.id} />
                          <input type="hidden" name="status" value="encerrado" />
                          <ConfirmSubmit
                            size="sm"
                            variant="ghost"
                            question={p.kind === "plano" ? "Encerrar este plano? As próximas mensalidades deixam de ser geradas." : "Encerrar este pacote? As sessões restantes não poderão mais ser usadas."}
                          >
                            {p.kind === "plano" ? "Encerrar plano" : "Encerrar pacote"}
                          </ConfirmSubmit>
                        </form>
                      )}
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="px-4 py-5 text-[15px] text-muted">Nenhum pacote ou plano. Sessões serão cobradas avulsas.</Card>
            )}
          </Section>
        )}

        {showFinance && (txs?.length ?? 0) > 0 && (
          <Section
            title="Pagamentos"
            action={open.length > 0 && <span className="text-sm font-medium text-warn">{formatMoney(openTotal)} em aberto</span>}
          >
            <Card className="divide-y divide-line overflow-hidden">
              {open.map((t) => {
                const late = t.due_date < today;
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.description}</p>
                      <p className={cx("text-sm", late ? "text-bad" : "text-muted")}>
                        {late ? "Venceu em " : "Vence em "}
                        {formatDateShort(t.due_date)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(t.amount_cents)}</span>
                    <PayButton id={t.id} type="receita" amountLabel="" back={`/pacientes/${patient.id}`} />
                  </div>
                );
              })}
              {paid.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{t.description}</p>
                    <p className="text-sm">
                      Pago em {formatDateShort(t.paid_on)} · {PAY_LABEL[t.payment_method ?? ""] ?? ""}
                    </p>
                  </div>
                  <span className="tabular-nums">{formatMoney(t.amount_cents)}</span>
                </div>
              ))}
            </Card>
          </Section>
        )}

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
