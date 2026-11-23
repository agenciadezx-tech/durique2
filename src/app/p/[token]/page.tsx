import Link from "next/link";
import { brandCss } from "@/lib/theme";
import { notFound } from "next/navigation";
import {
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  Dumbbell,
  FileSignature,
  Home,
  MessageCircle,
  PlayCircle,
  RefreshCcw,
  Wallet,
  UserRound,
  MapPin,
  AtSign,
  AlertCircle,
  CalendarClock,
  ChevronRight,
} from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { formatDateShort, formatMoney, TZ } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BookButton, SessionButtons } from "./portal-buttons";
import { ExerciseDone } from "./exercise-done";
import { FeedbackCard } from "./feedback-card";
import { safeUrl, youtubeId } from "@/lib/video";
import { CopyButton } from "@/components/copy-button";
import { pixCode } from "@/lib/pix";
import { ClinicMark } from "@/components/clinic-mark";

export const metadata = { title: "Meu painel", robots: { index: false } };
export const dynamic = "force-dynamic";

type ExPlan = {
  plan_id: string;
  title: string;
  frequency: string | null;
  done_today: boolean;
  days_7: number;
  items: { name: string; video_url: string | null; instructions: string | null; sets: string | null; notes: string | null }[];
};

type Portal = {
  patient: { name: string; phone: string | null };
  clinic: {
    name: string;
    whatsapp: string | null;
    instagram: string | null;
    color: string | null;
    booking_slug: string | null;
    logo: string | null;
    address: string | null;
    tagline: string | null;
  };
  fixed: { weekday: number; time: string; service: string }[];
  notice_hours: number;
  sessions: {
    attendee_id: string;
    starts_at: string;
    status: string;
    service: string;
    professional: string;
    is_makeup: boolean;
    notice_hours: number;
    service_id?: string;
    deadline?: string;
    can_cancel?: boolean;
    can_reschedule?: boolean;
  }[];
  credits: { expires_on: string }[];
  packages: {
    name: string;
    kind: string;
    service: string | null;
    total: number | null;
    used: number;
    expires_on: string | null;
    price_cents: number;
    per_week: number | null;
  }[];
  documents: { title: string; token: string }[];
  open_classes: { appointment_id: string; starts_at: string; service: string; service_id?: string; professional: string; free: number }[];
  pre_assessments: { token: string; kind: string }[];
};

const when = (ts: string) => {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ts));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hour = (ts: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "warn" | "bad" }> = {
  agendado: { label: "Agendada", tone: "neutral" },
  confirmado: { label: "Confirmada", tone: "info" },
  presente: { label: "Feita", tone: "ok" },
  falta: { label: "Falta", tone: "bad" },
  desmarcado_no_prazo: { label: "Desmarcada", tone: "warn" },
  desmarcado_fora_prazo: { label: "Desmarcada", tone: "warn" },
};

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { token } = await params;
  const { aba: abaParam } = await searchParams;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_get", { p_token: token });
  const d = data as Portal | null;
  if (!d) notFound();
  const [{ data: plansData }, { data: feedbackDue }, { data: reviewUrl }, { data: chargesData }, { data: changesData }] = await Promise.all([
    supabase.rpc("portal_exercises", { p_token: token }),
    supabase.rpc("portal_feedback_due", { p_token: token }),
    supabase.rpc("portal_review_url", { p_token: token }),
    supabase.rpc("portal_charges", { p_token: token }),
    supabase.rpc("portal_changes", { p_token: token }),
  ]);
  const changes = ((changesData ?? []) as { appointment_id: string; title: string | null; old_starts_at: string; new_starts_at: string }[]).filter(
    (c) => Date.parse(c.old_starts_at) !== Date.parse(c.new_starts_at),
  );
  const whenTxt = (ts: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  const ch = chargesData as {
    pix: { key: string; name: string; city: string } | null;
    charges: { id: string; description: string; amount_cents: number; due_date: string }[];
  } | null;
  const charges = ch?.charges ?? [];
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const plans = (plansData ?? []) as ExPlan[];
  const now = Date.now();
  const credits = d.credits.length;
  const color = d.clinic.color ?? "#0f766e";
  const wa = (text: string) => (d.clinic.whatsapp ? `https://wa.me/${d.clinic.whatsapp.replace("+", "")}?text=${encodeURIComponent(text)}` : null);

  const TABS = [
    { key: "inicio", label: "Início", icon: Home, badge: 0 },
    { key: "aulas", label: "Agenda", icon: CalendarCheck, badge: 0 },
    { key: "pagar", label: "Pagar", icon: Wallet, badge: charges.length },
    ...(plans.length ? [{ key: "exercicios", label: "Exercícios", icon: Dumbbell, badge: plans.filter((p) => !p.done_today).length }] : []),
    { key: "perfil", label: "Perfil", icon: UserRound, badge: 0 },
  ];
  const aba = TABS.some((t) => t.key === abaParam) ? abaParam! : "inicio";
  const hourNow = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  const hello = hourNow < 12 ? "Bom dia" : hourNow < 18 ? "Boa tarde" : "Boa noite";
  const nameParts = d.patient.name.trim().split(/\s+/);
  const lateCharges = charges.filter((c) => c.due_date < todayKey);
  const ending = d.packages.filter((k) => k.total != null && k.total - k.used <= 2);
  const sessionsLeft = d.packages.filter((k) => k.total != null).reduce((n, k) => n + Math.max(0, (k.total ?? 0) - k.used), 0);
  const bookHref = d.clinic.booking_slug ? `/agendar/${d.clinic.booking_slug}?p=${token}` : null;
  const dayKey = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
  const tomorrowKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + 864e5));
  const relDay = (ts: string) => (dayKey(ts) === todayKey ? "Hoje" : dayKey(ts) === tomorrowKey ? "Amanhã" : when(ts).split(",")[0]);
  const WD = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const tab = (k: string) => `/p/${token}${k === "inicio" ? "" : `?aba=${k}`}`;
  const next = d.sessions.find((s) => Date.parse(s.starts_at) > now && (s.status === "agendado" || s.status === "confirmado"));

  // Para remarcar: outras aulas do mesmo serviço com vaga
  const optionsFor = (s: Portal["sessions"][number]) =>
    d.open_classes
      .filter((c) => c.service_id === s.service_id)
      .slice(0, 12)
      .map((c) => ({ id: c.appointment_id, label: `${when(c.starts_at).split(",")[0]} ${formatDateShort(dayKey(c.starts_at)).slice(0, 5)} · ${hour(c.starts_at)}`, sub: `com ${c.professional} · ${c.free} vaga${c.free === 1 ? "" : "s"}` }));

  const SessionCard = ({ s }: { s: Portal["sessions"][number] }) => {
    const st = STATUS[s.status] ?? STATUS.agendado;
    const future = Date.parse(s.starts_at) > now;
    const inTime = s.deadline ? now <= Date.parse(s.deadline) : Date.parse(s.starts_at) - now >= (s.notice_hours ?? d.notice_hours) * 36e5;
    const canAct = future && (s.status === "agendado" || s.status === "confirmado");
    return (
      <Card className={cx("p-4", !canAct && "opacity-80")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{when(s.starts_at)}</p>
            <p className="text-[15px] text-muted">
              {hour(s.starts_at)} · {s.service}
              {s.is_makeup && " (reposição)"}
            </p>
            <p className="text-sm text-faint">com {s.professional}</p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        {canAct && <SessionButtons token={token} attendeeId={s.attendee_id} status={s.status} inTime={inTime} color={color} canCancel={s.can_cancel !== false} options={s.can_reschedule ? optionsFor(s) : undefined} />}
      </Card>
    );
  };

  return (
    <main className="min-h-dvh bg-bg pb-28">
      <style>{brandCss(color)}</style>
      <header className="border-b border-line bg-surface px-5 pt-6 pb-4">
        <div className="mx-auto max-w-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] text-muted">{hello},</p>
              <h1 className="truncate text-[26px] leading-tight font-semibold tracking-tight">
                {nameParts[0]} {nameParts.length > 1 && <span style={{ color }}>{nameParts[nameParts.length - 1]}</span>}
              </h1>
            </div>
            <Link href={tab("perfil")} aria-label="Meu perfil" className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: color }}>
              {(nameParts[0][0] + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : "")).toUpperCase()}
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-bg px-3 py-2">
            <ClinicMark brand={{ name: d.clinic.name, logo: d.clinic.logo, color }} size={30} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{d.clinic.name}</span>
            {d.clinic.whatsapp && (
              <a href={wa("Olá!") ?? "#"} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-full bg-ok-soft px-3 text-sm font-medium text-ok">
                <MessageCircle size={15} /> Falar
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto mt-5 max-w-lg space-y-6 px-5">
        {aba === "inicio" && (
          <>
            {/* O mais importante primeiro */}
            {next ? (
              <section className="overflow-hidden rounded-3xl border-2 bg-surface shadow-sm" style={{ borderColor: color }}>
                <div className="px-5 pt-4 pb-4" style={{ background: `${color}14` }}>
                  <p className="text-[12px] font-semibold tracking-wide uppercase" style={{ color }}>
                    Sua próxima {next.service.toLowerCase().includes("pilates") ? "aula" : "sessão"}
                  </p>
                  <p className="mt-1 text-[30px] leading-none font-semibold tracking-tight">
                    {relDay(next.starts_at)} · {hour(next.starts_at)}
                  </p>
                  <p className="mt-1.5 text-[15px] text-muted">
                    {relDay(next.starts_at) === "Hoje" || relDay(next.starts_at) === "Amanhã" ? `${when(next.starts_at)} · ` : `${when(next.starts_at).split(", ")[1]} · `}
                    {next.service} com {next.professional}
                  </p>
                  <span className="mt-2 inline-block">
                    <Badge tone={(STATUS[next.status] ?? STATUS.agendado).tone}>{next.status === "confirmado" ? "Presença confirmada" : "Aguardando sua confirmação"}</Badge>
                  </span>
                </div>
                <div className="px-5 pb-4">
                  <SessionButtons
                    token={token}
                    attendeeId={next.attendee_id}
                    status={next.status}
                    inTime={next.deadline ? now <= Date.parse(next.deadline) : Date.parse(next.starts_at) - now >= (next.notice_hours ?? d.notice_hours) * 36e5}
                    color={color}
                    canCancel={next.can_cancel !== false}
                    options={next.can_reschedule ? optionsFor(next) : undefined}
                  />
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border-2 bg-surface p-5 shadow-sm" style={{ borderColor: color }}>
                <p className="text-[12px] font-semibold tracking-wide uppercase" style={{ color }}>
                  {sessionsLeft > 0 ? "Você tem sessões para usar" : "Nenhuma sessão marcada"}
                </p>
                <p className="mt-1 text-[30px] leading-none font-semibold tracking-tight">
                  {sessionsLeft > 0 ? `${sessionsLeft} sess${sessionsLeft === 1 ? "ão" : "ões"}` : "Que tal marcar?"}
                </p>
                <p className="mt-1.5 text-[15px] text-muted">
                  {sessionsLeft > 0 ? "Escolha um horário para continuar seu tratamento." : "Escolha o melhor dia e horário para você."}
                </p>
                {bookHref && (
                  <Link href={bookHref} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white" style={{ background: color }}>
                    <CalendarPlus size={19} /> Agendar agora
                  </Link>
                )}
              </section>
            )}

            {/* Aulas que mudaram de dia */}
            {changes.length > 0 && (
              <div className="space-y-2">
                {changes.map((c) => (
                  <div key={c.appointment_id} className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info-soft px-4 py-3 text-info">
                    <CalendarClock size={20} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 text-[15px]">
                      <span className="block font-semibold">{c.title ?? "Sua sessão"} mudou de dia</span>
                      <span className="block">
                        <span className="line-through opacity-70">{whenTxt(c.old_starts_at)}</span> → <strong>{whenTxt(c.new_starts_at)}</strong>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pendências */}
            {(d.pre_assessments.length > 0 || d.documents.length > 0 || lateCharges.length > 0 || ending.length > 0) && (
              <div className="space-y-2">
                {ending.map((k, i) => {
                  const left = (k.total ?? 0) - k.used;
                  const buy = wa(`Olá! Quero renovar o ${k.name}.`);
                  return (
                    <div key={`e${i}`} className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
                      <RefreshCcw size={20} className="shrink-0 text-warn" />
                      <span className="min-w-0 flex-1 text-[15px]">
                        <span className="block font-semibold text-warn">{left <= 0 ? `Seu ${k.name} acabou` : `Seu ${k.name} está acabando`}</span>
                        <span className="block text-sm text-ink/80">
                          {left <= 0 ? "Renove para manter seus horários." : `Resta${left === 1 ? "" : "m"} ${left} sess${left === 1 ? "ão" : "ões"}. Renove e não perca o ritmo.`}
                        </span>
                      </span>
                      {buy && (
                        <a href={buy} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-warn">
                          Renovar
                        </a>
                      )}
                    </div>
                  );
                })}
                {lateCharges.length > 0 && (
                  <Link href={tab("pagar")} className="flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad-soft px-4 py-3 text-bad">
                    <AlertCircle size={20} />
                    <span className="flex-1 text-[15px] font-medium">
                      {lateCharges.length} pagamento{lateCharges.length === 1 ? "" : "s"} em atraso · pagar com Pix
                    </span>
                    <ChevronRight size={18} />
                  </Link>
                )}
                {d.pre_assessments.map((pa) => (
                  <Link key={pa.token} href={`/pre/${pa.token}`} className="flex items-center gap-3 rounded-2xl bg-info-soft px-4 py-3 text-info">
                    <ClipboardList size={20} />
                    <span className="flex-1 text-[15px]">
                      <span className="font-medium">Responder a pré-avaliação</span>
                      <span className="block text-sm">Leva 3 minutos e adianta sua consulta</span>
                    </span>
                    <ChevronRight size={18} />
                  </Link>
                ))}
                {d.documents.map((doc) => (
                  <Link key={doc.token} href={`/assinar/${doc.token}`} className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn">
                    <FileSignature size={20} />
                    <span className="flex-1 text-[15px]">
                      <span className="font-medium">Assinar: {doc.title}</span>
                      <span className="block text-sm">Toque para ler e assinar</span>
                    </span>
                    <ChevronRight size={18} />
                  </Link>
                ))}
              </div>
            )}

            {/* Planos */}
            {d.packages.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Seus planos</h2>
                  <Link href={tab("aulas")} className="text-sm font-medium" style={{ color }}>
                    Ver agenda
                  </Link>
                </div>
                <div className={cx("grid gap-3", d.packages.length > 1 && "grid-cols-2")}>
                  {d.packages.map((k, i) => {
                    const left = k.total != null ? Math.max(0, k.total - k.used) : null;
                    const buy = wa(k.kind === "plano" ? `Olá! Quero mudar meu plano (${k.name}).` : `Olá! Quero comprar mais sessões do ${k.name}.`);
                    const fixed = d.fixed.filter((f) => !k.service || f.service === k.service);
                    return (
                      <Card key={i} className="flex flex-col p-3.5">
                        <p className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">{k.name}</p>
                        {k.service && <p className="truncate text-sm text-muted">{k.service}</p>}
                        {left != null ? (
                          <>
                            <p className="mt-2 text-[28px] leading-none font-semibold tabular-nums">
                              {left} <span className="text-sm font-normal text-muted">restante{left === 1 ? "" : "s"}</span>
                            </p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (k.used / (k.total ?? 1)) * 100)}%`, background: color }} />
                            </div>
                            <p className="mt-1.5 text-[12px] text-muted">
                              {k.used} de {k.total} usadas{k.expires_on ? ` · vale até ${formatDateShort(k.expires_on).slice(0, 5)}` : ""}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className={cx("mt-2 text-[20px] font-semibold", lateCharges.length ? "text-bad" : "text-ok")}>{lateCharges.length ? "Em aberto" : "Em dia"}</p>
                            {fixed.length > 0 && (
                              <p className="mt-1 text-[12px] text-muted">{fixed.map((f) => `${WD[f.weekday]} ${f.time}`).join(" · ")}</p>
                            )}
                            <p className="text-[12px] text-muted">
                              {formatMoney(k.price_cents)}/mês{k.per_week ? ` · ${k.per_week}x/sem` : ""}
                            </p>
                          </>
                        )}
                        {buy && (
                          <a href={buy} target="_blank" rel="noreferrer" className="mt-auto inline-flex min-h-10 items-end pt-2 text-sm font-semibold" style={{ color }}>
                            {k.kind === "plano" ? "Mudar plano" : "+ Comprar sessões"}
                          </a>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {bookHref && next && (
              <Link href={bookHref} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white shadow-sm" style={{ background: color }}>
                <CalendarPlus size={20} /> Agendar
              </Link>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Link href={tab("aulas")} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-[15px] font-medium hover:bg-hover">
                <CalendarCheck size={20} style={{ color }} /> Minha agenda
              </Link>
              {credits > 0 ? (
                <Link href={tab("aulas")} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-[15px] font-medium hover:bg-hover">
                  <RefreshCcw size={20} style={{ color }} /> Repor aula ({credits})
                </Link>
              ) : plans.length ? (
                <Link href={tab("exercicios")} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-[15px] font-medium hover:bg-hover">
                  <Dumbbell size={20} style={{ color }} /> Exercícios
                </Link>
              ) : (
                <Link href={tab("pagar")} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-[15px] font-medium hover:bg-hover">
                  <Wallet size={20} style={{ color }} /> Pagamentos
                </Link>
              )}
            </div>

            {feedbackDue === true && <FeedbackCard token={token} clinic={d.clinic.name} reviewUrl={(reviewUrl as string | null) ?? null} />}
          </>
        )}

        {aba === "perfil" && (
          <>
            <Card className="p-5">
              <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">Seus dados</p>
              <p className="mt-2 text-[18px] font-semibold">{d.patient.name}</p>
              {d.patient.phone && <p className="text-[15px] text-muted">WhatsApp {d.patient.phone.replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}</p>}
              <p className="mt-3 text-sm text-muted">Algum dado errado? Fale com a clínica que ela corrige para você.</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <ClinicMark brand={{ name: d.clinic.name, logo: d.clinic.logo, color }} size={48} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.clinic.name}</p>
                  {d.clinic.tagline && <p className="truncate text-sm text-muted">{d.clinic.tagline}</p>}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {d.clinic.whatsapp && (
                  <a href={wa("Olá!") ?? "#"} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 text-[15px] font-medium">
                    <MessageCircle size={19} className="text-ok" /> Falar no WhatsApp
                  </a>
                )}
                {d.clinic.instagram && (
                  <a href={`https://instagram.com/${d.clinic.instagram}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 text-[15px] font-medium">
                    <AtSign size={19} className="text-muted" /> @{d.clinic.instagram}
                  </a>
                )}
                {d.clinic.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.clinic.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 py-2 text-[15px]"
                  >
                    <MapPin size={19} className="shrink-0 text-muted" />
                    <span>
                      <span className="block">{d.clinic.address}</span>
                      <span className="text-sm font-medium" style={{ color }}>
                        Ver no mapa
                      </span>
                    </span>
                  </a>
                )}
              </div>
            </Card>
            <p className="text-center text-sm text-muted">
              Para desmarcar sem perder a sessão, avise com {d.notice_hours}h de antecedência.
            </p>
          </>
        )}

        {aba === "aulas" && (
          <>
            <section>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Próximas sessões e aulas</h2>
              {d.sessions.length === 0 ? (
                <Card className="px-4 py-5 text-[15px] text-muted">Nada marcado nos próximos 30 dias.</Card>
              ) : (
                <div className="space-y-3">
                  {d.sessions.map((s) => (
                    <SessionCard key={s.attendee_id} s={s} />
                  ))}
                </div>
              )}
              <p className="mt-3 text-[13px] text-muted">
                Desmarcando com pelo menos {d.notice_hours} horas de antecedência você ganha uma reposição.
              </p>
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
                <RefreshCcw size={14} /> Reposições
              </h2>
              {credits === 0 ? (
                <Card className="px-4 py-5 text-[15px] text-muted">Você não tem reposições para usar agora.</Card>
              ) : (
                <>
                  <Card className="mb-3 bg-accent-soft p-4 text-[15px]">
                    Você tem <span className="font-semibold">{credits}</span> reposição{credits === 1 ? "" : "ões"} · a primeira vale até{" "}
                    {formatDateShort(d.credits[0].expires_on)}. Escolha uma aula com vaga:
                  </Card>
                  {d.open_classes.length === 0 ? (
                    <p className="text-[15px] text-muted">Nenhuma aula com vaga nos próximos 14 dias. Fale com a clínica.</p>
                  ) : (
                    <Card className="divide-y divide-line overflow-hidden">
                      {d.open_classes.map((c) => (
                        <div key={c.appointment_id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {when(c.starts_at).split(",")[0]}, {formatDateShort(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(c.starts_at))).slice(0, 5)} ·{" "}
                              {hour(c.starts_at)}
                            </p>
                            <p className="truncate text-sm text-muted">
                              {c.service} · {c.free} vaga{c.free === 1 ? "" : "s"}
                            </p>
                          </div>
                          <BookButton token={token} appointmentId={c.appointment_id} />
                        </div>
                      ))}
                    </Card>
                  )}
                </>
              )}
            </section>
            {d.clinic.booking_slug && (
              <Link
                href={`/agendar/${d.clinic.booking_slug}?p=${token}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
                style={{ background: color }}
              >
                <CalendarPlus size={18} /> Marcar uma sessão nova
              </Link>
            )}
          </>
        )}

        {aba === "pagar" && (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Pagamentos em aberto</h2>
            {charges.length === 0 ? (
              <Card className="px-4 py-5 text-[15px] text-muted">Tudo em dia. Nenhum pagamento em aberto. 🎉</Card>
            ) : (
              <div className="space-y-3">
                {charges.map((c) => {
                  const late = c.due_date < todayKey;
                  return (
                    <Card key={c.id} className={cx("p-4", late && "border-bad/30")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{c.description}</p>
                          <p className={cx("text-sm", late ? "text-bad" : "text-muted")}>
                            {late ? "Venceu" : "Vence"} em {formatDateShort(c.due_date)}
                          </p>
                        </div>
                        <p className="text-[18px] font-semibold tabular-nums">{formatMoney(c.amount_cents)}</p>
                      </div>
                      {ch?.pix ? (
                        <div className="mt-3">
                          <CopyButton text={pixCode(ch.pix, c.amount_cents, c.id.slice(0, 8))} label="Copiar código Pix" />
                          <p className="mt-1.5 text-[13px] text-muted">
                            Abra o app do seu banco, escolha Pix → Copia e cola e cole o código. O valor já vem preenchido.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">Combine o pagamento com a clínica.</p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {aba === "exercicios" &&
          plans.map((pl) => (
            <section key={pl.plan_id}>
              <h2 className="mb-1 flex items-center gap-2 text-[17px] font-semibold">
                <Dumbbell size={20} style={{ color }} /> {pl.title}
              </h2>
              <p className="mb-3 text-sm text-muted">
                {pl.frequency ? `${pl.frequency} · ` : ""}fez em {pl.days_7} dos últimos 7 dias
              </p>
              <div className="space-y-3">
                {pl.items.map((it, i) => {
                  const url = safeUrl(it.video_url);
                  const yt = youtubeId(url);
                  return (
                    <Card key={i} className="overflow-hidden">
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="relative block bg-ink/5">
                          {yt ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover" />
                          ) : (
                            <span className="block aspect-[3/1]" />
                          )}
                          <span className="absolute inset-0 grid place-items-center">
                            <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white">
                              <PlayCircle size={20} /> Ver vídeo
                            </span>
                          </span>
                        </a>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold">
                            {i + 1}. {it.name}
                          </p>
                          {it.sets && <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-accent">{it.sets}</span>}
                        </div>
                        {it.instructions && <p className="mt-1 text-[15px] whitespace-pre-line text-muted">{it.instructions}</p>}
                      </div>
                    </Card>
                  );
                })}
                <ExerciseDone token={token} planId={pl.plan_id} doneToday={pl.done_today} />
              </div>
            </section>
          ))}

        <p className="pt-4 text-center text-[13px] text-faint">Este link é pessoal. Não compartilhe.</p>
      </div>

      {/* Abas de app */}
      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tab(t.key)}
              aria-current={aba === t.key ? "page" : undefined}
              className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium", aba !== t.key && "text-muted")}
              style={aba === t.key ? { color } : undefined}
            >
              <t.icon size={22} strokeWidth={aba === t.key ? 2.2 : 1.8} />
              {t.label}
              {t.badge > 0 && (
                <span className="absolute top-2 right-[calc(50%-1.25rem)] grid size-4 place-items-center rounded-full bg-bad text-[10px] font-bold text-white">
                  {t.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
      <p className="mt-8 pb-4 text-center text-[13px] text-faint">
        <Link href="/privacidade" className="hover:underline">
          Privacidade
        </Link>{" "}
        ·{" "}
        <Link href="/termos" className="hover:underline">
          Termos
        </Link>
      </p>
    </main>
  );
}
