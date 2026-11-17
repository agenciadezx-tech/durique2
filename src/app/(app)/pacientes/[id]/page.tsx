import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, TrendingUp, Wallet, CheckCircle2, XCircle, ExternalLink, Smartphone, FileSignature, Lock, MessageCircle, Package, Repeat } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PayButton } from "@/components/finance";
import { WaSendButton } from "@/components/wa-send";
import { firstName, renderTemplate } from "@/lib/messages";
import { Alert, Badge, buttonClass, Card, cx, EmptyState, Field, Input, LinkButton, Section, Select } from "@/components/ui";
import { AttendeeBadge } from "@/components/status";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatDateShort, formatMoney, formatTimestampShort, PAY_LABEL, todayISO, whatsappLink, WEEKDAYS } from "@/lib/format";
import { createDocument, freezePackage, registerDischarge, requestPreAssessment, setPackageStatus, setPatientActive, updatePatient } from "../actions";
import { PreAnswers } from "@/components/pre-answers";
import { CopyButton } from "@/components/copy-button";
import { PatientFields } from "../patient-fields";
import { levelLabel } from "@/lib/levels";
import { SummaryEditor } from "./summary-editor";
import { ConfirmBell, PatientMenu, type MenuItem } from "./header-actions";
import { ManageClasses } from "./manage-classes";
import { formatPhone } from "@/lib/format";

export default async function PacientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; vendido?: string; aba?: string; pre?: string; erro?: string; f?: string }>;
}) {
  const ctx = await getContext();
  const { id } = await params;
  const { salvo, vendido, aba: abaParam, pre: preToken, erro, f: finFilter } = await searchParams;
  const supabase = await createClient();

  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (!patient) notFound();

  const [{ data: enrollments }, { data: upcoming }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, starts_on, ends_on, recurring_series(id, name, weekday, start_time, duration_min, active, services(name), professionals(name))")
      .eq("patient_id", id)
      .or(`ends_on.is.null,ends_on.gte.${new Date().toISOString().slice(0, 10)}`),
    supabase
      .from("appointment_attendees")
      .select("id, status, appointments!inner(id, starts_at, status, capacity, services(name, kind))")
      .eq("patient_id", id)
      .gte("appointments.starts_at", new Date().toISOString())
      .eq("appointments.status", "agendado")
      .not("status", "eq", "removido")
      .order("starts_at", { referencedTable: "appointments" })
      .limit(8),
  ]);

  type Series = { id: string; weekday: number; start_time: string; active: boolean; services: { name: string } | null; professionals: { name: string } | null };
  type Appt = { id: string; starts_at: string; capacity: number; services: { name: string; kind: string } | null };
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
  type Evo = {
    level: number | null;
    note: string | null;
    appointments: {
      id: string;
      starts_at: string;
      services: { name: string } | null;
      professionals: { name: string } | null;
      session_evolutions: { notes: string | null }[];
    } | null;
  };
  const evos: Evo[] = ctx.canSeeClinical
    ? ((
        await supabase
          .from("patient_evolutions")
          .select("level, note, appointments(id, starts_at, services(name), professionals(name), session_evolutions(notes))")
          .eq("patient_id", id)
          .or("level.not.is.null,note.not.is.null")
          .limit(60)
      ).data ?? []) as unknown as Evo[]
    : [];
  evos.sort((a, b) => (b.appointments?.starts_at ?? "").localeCompare(a.appointments?.starts_at ?? ""));
  const lastLevel = evos.find((e) => e.level != null)?.level ?? null;
  const levelSeries = evos.filter((e) => e.level != null).slice(0, 12).reverse();
  const { data: waSettings } = await supabase.from("whatsapp_settings").select("tpl_renovacao").eq("clinic_id", ctx.clinicId).maybeSingle();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data: dischargeRows } = await supabase
    .from("discharges")
    .select("id, kind, discharged_on, notes, created_at")
    .eq("patient_id", id)
    .order("discharged_on", { ascending: false })
    .limit(10);
  const discharges = dischargeRows ?? [];
  const DISCHARGE_LABEL: Record<string, string> = { alta: "Recebeu alta", abandono: "Parou o tratamento", pausa: "Pausou o tratamento" };

  // ===== Pré-avaliação =====
  const { data: preStatus } = await supabase.rpc("pre_assessment_status", { p_patient: id });
  const preList = (preStatus ?? []) as { kind: string; token: string; created_at: string; answered_at: string | null }[];
  const preAnswered = ctx.canSeeClinical
    ? (((
        await supabase
          .from("pre_assessments")
          .select("id, kind, answers, config, answered_at")
          .eq("patient_id", id)
          .not("answered_at", "is", null)
          .order("answered_at", { ascending: false })
          .limit(5)
      ).data ?? []) as { id: string; kind: string; answers: Record<string, unknown>; config: { questions?: { id: string; label: string }[] }; answered_at: string }[])
    : [];
  const preLink = preToken && /^[a-f0-9]{32}$/.test(preToken) ? `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}/pre/${preToken}` : null;

  // ===== Abas =====
  const TABS = [
    { key: "geral", label: "Geral", show: true },
    { key: "clinico", label: "Clínico", show: ctx.canSeeClinical },
    { key: "financeiro", label: "Financeiro", show: showFinance },
    { key: "documentos", label: "Documentos", show: ctx.role !== "financeiro" },
    { key: "historico", label: "Linha do tempo", show: true },
    { key: "cadastro", label: "Cadastro", show: true },
  ].filter((t) => t.show);
  const aba = TABS.some((t) => t.key === abaParam) ? abaParam! : "geral";

  // ===== Vínculos: consultas (pacote) × aulas (turma/plano) =====
  const activePkgs = (packages ?? []).filter((p) => p.status === "ativo" && !(p.expires_on && p.expires_on < today));
  const consultaPkg = activePkgs.find((p) => p.kind === "pacote" && (p.total_sessions == null || (usedOf.get(p.id) ?? 0) < p.total_sessions));
  const plano = activePkgs.find((p) => p.kind === "plano");
  const isAulaAppt = (a: Appt) => a.services?.kind === "turma" || a.capacity > 1;
  const nextConsulta = sessions.find((x) => !isAulaAppt(x.appt));
  const nextAula = sessions.find((x) => isAulaAppt(x.appt));
  const age = patient.birth_date
    ? Math.floor((Date.parse(today) - Date.parse(patient.birth_date)) / (365.25 * 864e5))
    : null;

  // ===== Linha do tempo =====
  type Ev = { at: string; icon: "sessao" | "falta" | "pago" | "doc" | "clin" | "pacote"; text: string; sub?: string; href?: string };
  let timeline: Ev[] = [];
  if (aba === "historico") {
    const [{ data: past }, { data: recs }] = await Promise.all([
      supabase
        .from("appointment_attendees")
        .select("status, appointments!inner(id, starts_at, services(name), professionals(name))")
        .eq("patient_id", id)
        .lt("appointments.starts_at", new Date().toISOString())
        .neq("status", "removido")
        .limit(200),
      ctx.canSeeClinical
        ? supabase.from("clinical_records").select("id, kind, record_date, created_at").eq("patient_id", id).limit(100)
        : Promise.resolve({ data: [] as { id: string; kind: string; record_date: string; created_at: string }[] }),
    ]);
    const ST: Record<string, string> = {
      presente: "Veio",
      falta: "Faltou",
      desmarcado_no_prazo: "Desmarcou no prazo",
      desmarcado_fora_prazo: "Desmarcou em cima da hora",
      agendado: "Sem chamada",
      confirmado: "Confirmado, sem chamada",
    };
    type P = { status: string; appointments: { id: string; starts_at: string; services: { name: string } | null; professionals: { name: string } | null } };
    timeline = [
      ...((past ?? []) as unknown as P[]).map((x) => ({
        at: x.appointments.starts_at,
        icon: (x.status === "presente" ? "sessao" : "falta") as Ev["icon"],
        text: `${x.appointments.services?.name ?? "Sessão"} · ${ST[x.status] ?? x.status}`,
        sub: x.appointments.professionals?.name,
        href: `/agenda/${x.appointments.id}`,
      })),
      ...(txs ?? [])
        .filter((t) => t.paid_on)
        .map((t) => ({ at: `${t.paid_on}T12:00:00-03:00`, icon: "pago" as const, text: `Pagou ${formatMoney(t.amount_cents)}`, sub: t.description })),
      ...(packages ?? []).map((k) => ({ at: k.created_at, icon: "pacote" as const, text: `Comprou ${k.name}`, sub: formatMoney(k.price_cents) })),
      ...(docs ?? []).map((d) => ({
        at: d.signed_at ?? d.created_at,
        icon: "doc" as const,
        text: d.signed_at ? `Assinou: ${d.title}` : `Documento gerado: ${d.title}`,
        href: `/pacientes/${id}/documentos/${d.id}`,
      })),
      ...discharges.map((x) => ({
        at: `${x.discharged_on}T12:00:00-03:00`,
        icon: "clin" as const,
        text: DISCHARGE_LABEL[x.kind] ?? x.kind,
        sub: x.notes ?? undefined,
      })),
      ...(recs ?? []).map((r) => ({
        at: r.created_at,
        icon: "clin" as const,
        text: r.kind === "avaliacao" ? "Avaliação no prontuário" : r.kind === "adendo" ? "Adendo no prontuário" : "Evolução no prontuário",
        href: `/pacientes/${id}/prontuario/${r.id}`,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }
  const doneWeek = new Set((plans ?? []).flatMap((p) => p.exercise_logs.filter((l) => l.done_on > weekAgo).map((l) => l.done_on))).size;

  // Vínculos: selo do pacote, atraso, horários fixos e turmas com vaga (para "Gerir")
  const leftSessions = consultaPkg?.total_sessions != null ? consultaPkg.total_sessions - (usedOf.get(consultaPkg.id) ?? 0) : null;
  const pkgChip = !consultaPkg
    ? { l: "Sem pacote", c: "bg-hover text-muted" }
    : leftSessions != null && leftSessions <= 2
      ? { l: "Acabando", c: "bg-warn-soft text-warn" }
      : { l: "Em tratamento", c: "bg-ok-soft text-ok" };
  const lateCents = open.filter((t) => t.due_date < today).reduce((a, t) => a + t.amount_cents, 0);
  type EnrRow = { id: string; starts_on: string; recurring_series: { id: string; name: string | null; weekday: number; start_time: string; duration_min: number; active: boolean; services: { name: string } | null; professionals: { name: string } | null } | null };
  const enrRows = ((enrollments ?? []) as unknown as EnrRow[]).filter((e) => e.recurring_series?.active);
  const hhmm = (t: string, plus = 0) => {
    const [h, m] = t.split(":").map(Number);
    const x = h * 60 + m + plus;
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  };
  const myEnrollments = enrRows.map((e) => {
    const r = e.recurring_series!;
    return {
      id: e.id,
      label: `${WEEKDAYS[r.weekday].slice(0, 3)} · ${hhmm(r.start_time)}–${hhmm(r.start_time, r.duration_min)}`,
      sub: [r.name ?? r.services?.name, r.professionals?.name].filter(Boolean).join(" · "),
    };
  });
  const startedOn = [...enrRows.map((e) => e.starts_on), ...(plano ? [plano.starts_on] : [])].filter(Boolean).sort()[0] ?? null;
  let classOptions: { id: string; label: string; sub: string; free: number }[] = [];
  if (ctx.canManageAgenda && (plano || enrRows.length)) {
    const [{ data: allSeries }, { data: allEnr }] = await Promise.all([
      supabase
        .from("recurring_series")
        .select("id, name, weekday, start_time, duration_min, capacity, services(name), professionals(name)")
        .eq("clinic_id", ctx.clinicId)
        .eq("active", true)
        .gt("capacity", 1)
        .order("weekday")
        .order("start_time"),
      supabase.from("enrollments").select("series_id").eq("clinic_id", ctx.clinicId).or(`ends_on.is.null,ends_on.gte.${today}`),
    ]);
    const mine = new Set(enrRows.map((e) => e.recurring_series!.id));
    classOptions = (allSeries ?? [])
      .filter((x) => !mine.has(x.id))
      .map((x) => ({
        id: x.id,
        label: `${WEEKDAYS[x.weekday].slice(0, 3)} · ${hhmm(x.start_time)}–${hhmm(x.start_time, x.duration_min)}`,
        sub: [x.name ?? (x.services as unknown as { name: string } | null)?.name, (x.professionals as unknown as { name: string } | null)?.name].filter(Boolean).join(" · "),
        free: x.capacity - (allEnr ?? []).filter((e) => e.series_id === x.id).length,
      }));
  }

  const exercisesCard = ctx.canSeeClinical && (
<Link href={`/pacientes/${patient.id}/exercicios`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-colors hover:border-faint sm:p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Dumbbell size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Exercícios para casa</span>
                <span className="text-sm text-muted">
                  {(plans ?? []).length === 0 ? "Escolha da biblioteca com vídeo · aparece no app do paciente" : `Fez em ${doneWeek} dos últimos 7 dias`}
                </span>
              </span>
              <ChevronRight size={20} className="text-faint" />
            </Card>
          </Link>
  );
  const pid = patient.id;
  const menu: MenuItem[] = [
    ...(ctx.canSeeClinical
      ? [
          {
            href: `/pacientes/${pid}/prontuario/novo?tipo=evolucao`,
            label: "Nova evolução",
            icon: "NotebookPen" as const,
            ...(consultaPkg || plano || series.length ? {} : { hint: "Precisa de pacote ou turma ativos", disabled: true }),
          },
          { href: `/pacientes/${pid}/prontuario/novo?tipo=avaliacao`, label: "Nova avaliação", icon: "ClipboardList" as const },
          { href: `/pacientes/${pid}/exercicios`, label: "Passar exercícios para casa", icon: "Dumbbell" as const, hint: "Com vídeo, vai para o app do paciente" },
        ]
      : []),
    ...(ctx.canManageAgenda && patient.active
      ? [
          { href: `/agenda/nova?paciente=${pid}`, label: "Agendar", icon: "CalendarDays" as const },
          { href: `/pacientes/${pid}/vender`, label: "Vender pacote ou plano", icon: "Package" as const },
        ]
      : []),
    ...(wa ? [{ href: wa, label: "Mandar WhatsApp", icon: "MessageCircle" as const, external: true }] : []),
    ...(ctx.role !== "financeiro" ? [{ href: `/pacientes/${pid}?aba=documentos`, label: "Gerar documento", icon: "FileSignature" as const }] : []),
    { href: `/pacientes/${pid}?aba=cadastro`, label: "Editar cadastro", icon: "Pencil" as const },
    ...(patient.active && ctx.canManageAgenda ? [{ href: `/pacientes/${pid}?aba=cadastro#arquivar`, label: "Arquivar paciente", icon: "Archive" as const, tone: "bad" as const }] : []),
  ];

  return (
    <>
      <header className="mb-3 flex items-center gap-3">
        <Link href="/pacientes" aria-label="Voltar para pacientes" className="-ml-2 grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover lg:hidden">
          <ChevronLeft size={24} />
        </Link>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[16px] font-semibold text-accent lg:size-14 lg:text-[18px]">
          {patient.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((w: string) => w[0])
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 truncate text-[20px] leading-tight font-semibold tracking-tight lg:text-[24px]">{patient.name}</h1>
            {patient.active && <ConfirmBell id={patient.id} skip={!!patient.skip_confirmation} canEdit={ctx.canManageAgenda} />}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-muted lg:text-[15px]">
            {age != null && <span>{age} anos</span>}
            {age != null && patient.phone && <span aria-hidden>·</span>}
            {patient.phone && <span>{formatPhone(patient.phone)}</span>}
            {!patient.active && <Badge>Arquivado</Badge>}
            {patient.access_via && <Badge tone="info">{patient.access_via === "wellhub" ? "Wellhub" : "TotalPass"}</Badge>}
            {patient.skip_confirmation && <Badge tone="warn">Não pede confirmação</Badge>}
          </p>
        </div>
        {wa && (
          <span className="hidden sm:block">
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
              <MessageCircle size={18} /> WhatsApp
            </a>
          </span>
        )}
        <PatientMenu items={menu} />
      </header>

      <div className="mb-4">
        <SummaryEditor id={patient.id} value={patient.summary} canEdit={ctx.canManageAgenda || ctx.canSeeClinical} />
      </div>

      {/* Vínculos */}
      {!(consultaPkg || plano || series.length > 0 || sessions.length > 0) && patient.active ? (
        <Card className="mb-5 p-5">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Package size={22} />
          </span>
          <p className="mt-3 text-[17px] font-semibold">{firstName(patient.name)} ainda não começou</p>
          <p className="mt-1 text-[15px] text-muted">
            Começa por um <strong className="text-ink">pacote de sessões</strong> (consultas, com alta no fim) ou entrando numa{" "}
            <strong className="text-ink">turma fixa</strong> (aulas toda semana). Agenda, cobranças e prontuário seguem a partir daí.
          </p>
          {ctx.canManageAgenda && (
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href={`/pacientes/${patient.id}/vender?tipo=pacote`} size="md">
                <Package size={18} /> Vender pacote de sessões
              </LinkButton>
              <LinkButton href={`/pacientes/${patient.id}/vender?tipo=plano`} size="md" variant="secondary">
                <Dumbbell size={18} /> Matricular em aulas
              </LinkButton>
              <LinkButton href={`/agenda/nova?paciente=${patient.id}`} size="md" variant="ghost">
                <CalendarDays size={18} /> Só agendar
              </LinkButton>
            </div>
          )}
        </Card>
      ) : (
      <div className="mb-5 space-y-2">
        <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Vínculos</p>
        <div className="grid gap-3 sm:grid-cols-2">
        {/* Consultas · pacote */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-chart-in" />
            <span className="text-[12px] font-semibold tracking-wide text-chart-in uppercase">Pacote · Consultas</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", pkgChip.c)}>{pkgChip.l}</span>
            <Link href={`/pacientes/${patient.id}?aba=financeiro`} aria-label="Ver no financeiro" className="ml-auto grid size-9 place-items-center rounded-xl border border-line text-muted hover:bg-hover">
              <ChevronRight size={17} />
            </Link>
          </div>
          {consultaPkg ? (
            <>
              <p className="mt-2 text-[17px] font-semibold">{consultaPkg.name}</p>
              {consultaPkg.total_sessions != null && (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
                    <div className="h-full rounded-full bg-chart-in" style={{ width: `${Math.min(100, ((usedOf.get(consultaPkg.id) ?? 0) / consultaPkg.total_sessions) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-sm text-muted">
                    {usedOf.get(consultaPkg.id) ?? 0} de {consultaPkg.total_sessions} feitas · <strong className="text-ink">{consultaPkg.total_sessions - (usedOf.get(consultaPkg.id) ?? 0)} restantes</strong>
                  </p>
                </>
              )}
              <p className="mt-1 text-sm text-muted">
                {nextConsulta ? `Próxima · ${formatTimestampShort(nextConsulta.appt.starts_at)}` : "Sem consulta marcada"}
                {consultaPkg.expires_on && ` · vale até ${formatDateShort(consultaPkg.expires_on)}`}
              </p>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="block text-[17px] font-semibold text-muted">Sem pacote ativo</span>
                <span className="text-sm text-muted">Venda um pacote para começar as sessões.</span>
              </span>
              {ctx.canManageAgenda && patient.active && (
                <LinkButton href={`/pacientes/${patient.id}/vender?tipo=pacote`} size="sm" variant="secondary">
                  Vender pacote
                </LinkButton>
              )}
            </div>
          )}
        </Card>

        {/* Aulas · matrícula */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Dumbbell size={16} className="text-chart-out" />
            <span className="text-[12px] font-semibold tracking-wide text-chart-out uppercase">Matrícula · Aulas</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", plano ? "bg-ok-soft text-ok" : series.length ? "bg-info-soft text-info" : "bg-hover text-muted")}>
              {plano ? "Mensalista" : series.length ? "Turma fixa" : "Sem matrícula"}
            </span>
            {ctx.canManageAgenda && patient.active && (plano || series.length > 0) && (
              <span className="ml-auto">
                <ManageClasses
                  patientId={patient.id}
                  plan={plano ? { id: plano.id, name: plano.name, price_cents: plano.price_cents } : null}
                  late={lateCents}
                  enrollments={myEnrollments}
                  options={classOptions}
                  startedOn={startedOn}
                />
              </span>
            )}
          </div>
          {series.length > 0 || plano ? (
            <>
              <p className="mt-2 text-[17px] font-semibold">
                {plano?.name ?? series[0].services?.name ?? "Turma fixa"}
                {plano && <span className="text-[15px] font-normal text-muted"> · {formatMoney(plano.price_cents)}/mês</span>}
              </p>
              <p className="mt-1 text-sm text-muted">
                {series.length > 0 ? series.map((x) => `${WEEKDAYS[x.weekday].slice(0, 3)} ${x.start_time.slice(0, 5)}`).join(" · ") : "Sem horário fixo ainda"}
              </p>
              {nextAula && <p className="mt-0.5 text-sm text-muted">Próxima · {formatTimestampShort(nextAula.appt.starts_at)}</p>}
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="block text-[17px] font-semibold text-muted">Sem turma</span>
                <span className="text-sm text-muted">Matricule para entrar nas aulas fixas.</span>
              </span>
              {ctx.canManageAgenda && patient.active && (
                <LinkButton href={`/pacientes/${patient.id}/vender?tipo=plano`} size="sm" variant="secondary">
                  Matricular
                </LinkButton>
              )}
            </div>
          )}
        </Card>
        </div>
      </div>
      )}

      {/* Abas */}
      <nav className="-mx-5 mb-6 flex gap-1 overflow-x-auto border-b border-line px-5 lg:mx-0 lg:px-0" aria-label="Seções do paciente">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/pacientes/${patient.id}${t.key === "geral" ? "" : `?aba=${t.key}`}`}
            aria-current={aba === t.key ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-3 text-[15px] font-medium whitespace-nowrap transition-colors",
              aba === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-8">
        {salvo && <Alert tone="ok">Paciente cadastrado!</Alert>}
        {vendido && <Alert tone="ok">Venda registrada! As parcelas já estão em Contas a receber.</Alert>}
        {aba === "geral" && (
          <>
        {exercisesCard}
        {credits && credits.length > 0 && (
          <Alert tone="info">
            {credits.length} reposição{credits.length === 1 ? "" : "ões"} disponível{credits.length === 1 ? "" : "is"} · a primeira vence em{" "}
            {formatDateShort(credits[0].expires_on)}. Para usar, adicione o paciente numa aula marcando “É reposição de aula”.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Turmas">
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
                Sem turma fixa.{" "}
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

          </>
        )}

        {aba === "geral" && patient.active && ctx.role !== "financeiro" && (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-info-soft text-info">
                <ClipboardList size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Pré-avaliação</span>
                <span className="text-sm text-muted">
                  {preList[0]
                    ? preList[0].answered_at
                      ? `Respondida em ${formatDateShort(preList[0].answered_at.slice(0, 10))}${ctx.canSeeClinical ? " · veja em Clínico" : ""}`
                      : `Pedida em ${formatDateShort(preList[0].created_at.slice(0, 10))} · aguardando resposta`
                    : "Queixa, dor e histórico pelo celular antes de começar."}
                </span>
              </span>
              <form action={requestPreAssessment} className="flex w-full flex-wrap gap-2 sm:w-auto">
                <input type="hidden" name="patient_id" value={patient.id} />
                <button name="kind" value="consulta" className={buttonClass("secondary", "sm")}>
                  Pedir (consulta)
                </button>
                <button name="kind" value="aula" className={buttonClass("secondary", "sm")}>
                  Pedir (aula)
                </button>
              </form>
            </div>
            {preLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-info-soft/60 p-3">
                <span className="min-w-0 flex-1 text-sm">Link criado. Envie para o paciente:</span>
                {patient.phone && (
                  <WaSendButton
                    phone={patient.phone}
                    kind="outro"
                    patientId={patient.id}
                    label="Enviar no WhatsApp"
                    body={`Olá, ${firstName(patient.name)}! Para adiantar seu atendimento na ${ctx.clinicName}, responda esta pré-avaliação (leva uns 3 minutos): ${preLink}`}
                  />
                )}
                <CopyButton text={preLink} label="Copiar link" />
              </div>
            )}
            {erro === "pre" && <p className="mt-2 text-sm text-bad">Não foi possível criar o link. Tente de novo.</p>}
          </Card>
        )}

        {aba === "geral" && ctx.role !== "financeiro" && (
          <Card>
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
                  <CheckCircle2 size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Fim do tratamento</span>
                  <span className="text-sm text-muted">
                    {discharges[0]
                      ? `${DISCHARGE_LABEL[discharges[0].kind]} em ${formatDateShort(discharges[0].discharged_on)}`
                      : "Registre a alta, a pausa ou quando o paciente parar de vir."}
                  </span>
                </span>
                <span className="text-sm text-muted group-open:hidden">Registrar</span>
                <span className="hidden text-sm text-muted group-open:inline">Fechar</span>
              </summary>
              <div className="border-t border-line px-4 py-5">
                <ActionForm action={registerDischarge} resetOnSuccess>
                  <input type="hidden" name="patient_id" value={patient.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="O que aconteceu">
                      <Select name="kind" defaultValue="alta">
                        <option value="alta">Recebeu alta (terminou o tratamento)</option>
                        <option value="pausa">Pausou (vai voltar depois)</option>
                        <option value="abandono">Parou de vir sem terminar</option>
                      </Select>
                    </Field>
                    <Field label="Data">
                      <Input type="date" name="discharged_on" defaultValue={today} max={today} required />
                    </Field>
                  </div>
                  <Field label="Observação (opcional)" hint="Ex.: objetivo alcançado, voltou a correr.">
                    <Input name="notes" maxLength={500} />
                  </Field>
                  <SubmitButton size="md">Registrar</SubmitButton>
                  <p className="text-[13px] text-muted">O histórico continua guardado. Isso entra nos números de Saúde do negócio.</p>
                </ActionForm>
                {discharges.length > 0 && (
                  <ul className="mt-5 divide-y divide-line border-t border-line text-sm">
                    {discharges.map((x) => (
                      <li key={x.id} className="py-2">
                        <span className="font-medium">{DISCHARGE_LABEL[x.kind]}</span> · {formatDateShort(x.discharged_on)}
                        {x.notes && <span className="text-muted"> · {x.notes}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </Card>
        )}

        {aba === "clinico" && (
          <>
            {preAnswered.map((pa) => (
              <Card key={pa.id} className="p-5">
                <p className="mb-3 flex items-center gap-2 font-semibold">
                  <ClipboardList size={18} className="text-info" /> Pré-avaliação ({pa.kind === "aula" ? "aula" : "consulta"}) · respondida em{" "}
                  {formatDateShort(pa.answered_at.slice(0, 10))}
                </p>
                <PreAnswers answers={pa.answers ?? {}} questions={pa.config?.questions ?? []} />
              </Card>
            ))}
          </>
        )}

        {aba === "clinico" && (
          <>
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

        {exercisesCard}

        {ctx.canSeeClinical && evos.length > 0 && (
          <Section title="Evolução nas aulas">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-4 sm:px-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <TrendingUp size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted">Nível atual</p>
                  <p className="text-[20px] font-semibold">
                    {lastLevel != null ? (
                      <>
                        {lastLevel} <span className="text-[15px] font-normal text-muted">· {levelLabel(lastLevel)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                {levelSeries.length > 1 && (
                  <div className="flex h-12 items-end gap-1" role="img" aria-label={`Nível nas últimas aulas: ${levelSeries.map((e) => e.level).join(", ")}`}>
                    {levelSeries.map((e, i) => (
                      <span
                        key={i}
                        title={`${formatDateShort(e.appointments!.starts_at.slice(0, 10))}: nível ${e.level}`}
                        className={cx("w-3 rounded-t-[3px]", i === levelSeries.length - 1 ? "bg-accent" : "bg-accent/45")}
                        style={{ height: `${(e.level! / 5) * 100}%` }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <ul className="divide-y divide-line">
                {evos.slice(0, 8).map((e, i) => (
                  <li key={i} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/agenda/${e.appointments?.id}`} className="text-sm text-muted hover:underline">
                        {e.appointments ? formatTimestampShort(e.appointments.starts_at) : ""} · {e.appointments?.services?.name}
                        {e.appointments?.professionals ? ` · ${e.appointments.professionals.name}` : ""}
                      </Link>
                      {e.level != null && <Badge tone="info">Nível {e.level}</Badge>}
                    </div>
                    {e.appointments?.session_evolutions?.[0]?.notes && <p className="mt-1 text-[15px]">{e.appointments.session_evolutions[0].notes}</p>}
                    {e.note && <p className="mt-1 text-[15px] font-medium">Obs.: {e.note}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

          </>
        )}

        {aba === "documentos" && (
          <>
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

          </>
        )}

        {aba === "financeiro" && (
          <>
        {showFinance && (
          <Section
            title="Pacotes e planos"
            action={
              ctx.canManageAgenda && (
                <details className="group relative">
                  <summary className={cx(buttonClass("primary", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                    Vender <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="absolute top-full right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-xl">
                    <Link href={`/pacientes/${patient.id}/vender?tipo=pacote`} className="flex min-h-12 items-center gap-3 px-4 hover:bg-hover">
                      <Package size={18} className="text-chart-in" />
                      <span>
                        <span className="block font-medium">Pacote de sessões</span>
                        <span className="block text-[12px] text-muted">Consultas, com alta no fim</span>
                      </span>
                    </Link>
                    <Link href={`/pacientes/${patient.id}/vender?tipo=plano`} className="flex min-h-12 items-center gap-3 px-4 hover:bg-hover">
                      <Dumbbell size={18} className="text-chart-out" />
                      <span>
                        <span className="block font-medium">Matrícula em aulas</span>
                        <span className="block text-[12px] text-muted">Plano mensal e turmas fixas</span>
                      </span>
                    </Link>
                  </div>
                </details>
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

        {showFinance && (
          <Section
            title="Lançamentos · só deste paciente"
            action={open.length > 0 && <span className="text-sm font-medium text-warn">{formatMoney(openTotal)} em aberto</span>}
          >
            <div className="flex flex-wrap gap-2">
              {[
                { k: "", l: "Tudo", n: (txs ?? []).length },
                { k: "abertos", l: "Em aberto", n: open.length },
                { k: "pagos", l: "Pagos", n: (txs ?? []).length - open.length },
              ].map((c) => (
                <Link
                  key={c.k || "tudo"}
                  href={`/pacientes/${patient.id}?aba=financeiro${c.k ? `&f=${c.k}` : ""}`}
                  aria-current={(finFilter ?? "") === c.k ? "true" : undefined}
                  className={cx(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold",
                    (finFilter ?? "") === c.k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface",
                  )}
                >
                  {c.l} <span className="font-normal text-muted">{c.n}</span>
                </Link>
              ))}
            </div>
            {(() => {
              const list = (txs ?? [])
                .filter((t) => (finFilter === "abertos" ? !t.paid_on : finFilter === "pagos" ? !!t.paid_on : true))
                .sort((x, y) => (x.paid_on ? 1 : 0) - (y.paid_on ? 1 : 0) || (x.paid_on ? y.paid_on!.localeCompare(x.paid_on!) : x.due_date.localeCompare(y.due_date)));
              if (!list.length)
                return (
                  <EmptyState
                    title={finFilter === "abertos" ? "Nada em aberto" : finFilter === "pagos" ? "Nenhum pagamento ainda" : "Sem lançamentos"}
                    text="As cobranças e os pagamentos deste paciente aparecem aqui. Para começar, use Vender."
                  />
                );
              return (
                <Card className="divide-y divide-line overflow-hidden">
                  {list.map((t) =>
                    t.paid_on ? (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className="text-sm text-muted">
                            Pago em {formatDateShort(t.paid_on)} · {PAY_LABEL[t.payment_method ?? ""] ?? ""}
                          </p>
                        </div>
                        <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">Pago</span>
                        <span className="tabular-nums">{formatMoney(t.amount_cents)}</span>
                      </div>
                    ) : (
                      <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className={cx("text-sm", t.due_date < today ? "text-bad" : "text-muted")}>
                            {t.due_date < today ? "Venceu em " : "Vence em "}
                            {formatDateShort(t.due_date)}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">{formatMoney(t.amount_cents)}</span>
                        <PayButton id={t.id} type="receita" amountLabel="" back={`/pacientes/${patient.id}?aba=financeiro`} />
                      </div>
                    ),
                  )}
                </Card>
              );
            })()}
          </Section>
        )}

          </>
        )}

        {aba === "historico" && (
          timeline.length === 0 ? (
            <Card className="px-4 py-5 text-[15px] text-muted">Nada registrado ainda.</Card>
          ) : (
            <ol className="relative space-y-1 border-l-2 border-line pl-5">
              {timeline.slice(0, 80).map((e, i) => {
                const Icon = { sessao: CheckCircle2, falta: XCircle, pago: Wallet, doc: FileSignature, clin: Lock, pacote: Package }[e.icon];
                const tone = { sessao: "text-ok", falta: "text-bad", pago: "text-ok", doc: "text-info", clin: "text-accent", pacote: "text-accent" }[e.icon];
                const body = (
                  <>
                    <span className={cx("absolute -left-[31px] grid size-5 place-items-center rounded-full bg-bg", tone)}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{e.text}</span>
                      {e.sub && <span className="block text-sm text-muted">{e.sub}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-muted tabular-nums">{formatDateShort(e.at.slice(0, 10))}</span>
                  </>
                );
                return (
                  <li key={i} className="relative">
                    {e.href ? (
                      <Link href={e.href} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )
        )}

        {aba === "cadastro" && (
          <>
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
          <form action={setPatientActive} id="arquivar" className="scroll-mt-24">
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
          </>
        )}

      </div>
    </>
  );
}
