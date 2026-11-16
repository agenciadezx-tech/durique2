import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  Dumbbell,
  FileSignature,
  Home,
  MessageCircle,
  Package,
  PlayCircle,
  RefreshCcw,
  Repeat,
  Wallet,
} from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { formatDateShort, formatMoney, TZ } from "@/lib/format";
import { firstName } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { BookButton, SessionButtons } from "./portal-buttons";
import { ExerciseDone } from "./exercise-done";
import { FeedbackCard } from "./feedback-card";
import { safeUrl, youtubeId } from "@/lib/video";
import { CopyButton } from "@/components/copy-button";
import { pixCode } from "@/lib/pix";

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
  clinic: { name: string; whatsapp: string | null; instagram: string | null; color: string | null; booking_slug: string | null };
  notice_hours: number;
  sessions: {
    attendee_id: string;
    starts_at: string;
    status: string;
    service: string;
    professional: string;
    is_makeup: boolean;
    notice_hours: number;
  }[];
  credits: { expires_on: string }[];
  packages: { name: string; kind: string; total: number | null; used: number; expires_on: string | null; price_cents: number; per_week: number | null }[];
  documents: { title: string; token: string }[];
  open_classes: { appointment_id: string; starts_at: string; service: string; professional: string; free: number }[];
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
  const [{ data: plansData }, { data: feedbackDue }, { data: reviewUrl }, { data: chargesData }] = await Promise.all([
    supabase.rpc("portal_exercises", { p_token: token }),
    supabase.rpc("portal_feedback_due", { p_token: token }),
    supabase.rpc("portal_review_url", { p_token: token }),
    supabase.rpc("portal_charges", { p_token: token }),
  ]);
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
    { key: "aulas", label: "Aulas", icon: CalendarCheck, badge: 0 },
    { key: "pagar", label: "Pagar", icon: Wallet, badge: charges.length },
    ...(plans.length ? [{ key: "exercicios", label: "Exercícios", icon: Dumbbell, badge: plans.filter((p) => !p.done_today).length }] : []),
  ];
  const aba = TABS.some((t) => t.key === abaParam) ? abaParam! : "inicio";
  const tab = (k: string) => `/p/${token}${k === "inicio" ? "" : `?aba=${k}`}`;
  const next = d.sessions.find((s) => Date.parse(s.starts_at) > now && (s.status === "agendado" || s.status === "confirmado"));

  const SessionCard = ({ s }: { s: Portal["sessions"][number] }) => {
    const st = STATUS[s.status] ?? STATUS.agendado;
    const future = Date.parse(s.starts_at) > now;
    const inTime = Date.parse(s.starts_at) - now >= (s.notice_hours ?? d.notice_hours) * 36e5;
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
        {canAct && <SessionButtons token={token} attendeeId={s.attendee_id} status={s.status} inTime={inTime} />}
      </Card>
    );
  };

  return (
    <main className="min-h-dvh pb-28">
      <header className="px-5 pt-6 pb-7 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}d9)` }}>
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <span className="text-sm font-medium text-white/85">{d.clinic.name}</span>
          {d.clinic.whatsapp && (
            <a href={wa("Olá!") ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
              <MessageCircle size={16} /> Falar com a clínica
            </a>
          )}
        </div>
        <h1 className="mx-auto mt-4 max-w-lg text-[26px] leading-tight font-semibold tracking-tight">Olá, {firstName(d.patient.name)}!</h1>
      </header>

      <div className="mx-auto mt-5 max-w-lg space-y-6 px-5">
        {aba === "inicio" && (
          <>
            {(d.documents.length > 0 || d.pre_assessments.length > 0) && (
              <div className="space-y-2">
                {d.pre_assessments.map((pa) => (
                  <Link key={pa.token} href={`/pre/${pa.token}`} className="flex items-center gap-3 rounded-2xl bg-info-soft px-4 py-3 text-info shadow-sm">
                    <ClipboardList size={20} />
                    <span className="flex-1 text-[15px]">
                      <span className="font-medium">Responder a pré-avaliação</span>
                      <span className="block text-sm">Leva 3 minutos e adianta sua consulta</span>
                    </span>
                  </Link>
                ))}
                {d.documents.map((doc) => (
                  <Link key={doc.token} href={`/assinar/${doc.token}`} className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn shadow-sm">
                    <FileSignature size={20} />
                    <span className="flex-1 text-[15px]">
                      <span className="font-medium">Assinar: {doc.title}</span>
                      <span className="block text-sm">Toque para ler e assinar</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <section>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Próxima aula</h2>
              {next ? (
                <SessionCard s={next} />
              ) : (
                <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma aula marcada.</Card>
              )}
            </section>

            <div className="grid grid-cols-2 gap-2">
              {[
                d.clinic.booking_slug && { href: `/agendar/${d.clinic.booking_slug}?p=${token}`, icon: CalendarPlus, label: "Marcar sessão" },
                { href: tab("aulas"), icon: CalendarCheck, label: "Minhas aulas" },
                { href: tab("pagar"), icon: Wallet, label: charges.length ? `Pagar (${charges.length})` : "Pagamentos" },
                credits > 0 ? { href: tab("aulas"), icon: RefreshCcw, label: `Repor aula (${credits})` } : plans.length ? { href: tab("exercicios"), icon: Dumbbell, label: "Exercícios" } : null,
              ]
                .filter((x): x is { href: string; icon: typeof Home; label: string } => !!x)
                .map((a) => (
                  <Link key={a.label} href={a.href} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-[15px] font-medium shadow-sm hover:bg-hover">
                    <a.icon size={20} style={{ color }} /> {a.label}
                  </Link>
                ))}
            </div>

            {feedbackDue === true && <FeedbackCard token={token} clinic={d.clinic.name} reviewUrl={(reviewUrl as string | null) ?? null} />}

            {d.packages.length > 0 && (
              <section>
                <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Seus planos</h2>
                <div className="space-y-3">
                  {d.packages.map((k, i) => {
                    const left = k.total != null ? k.total - k.used : null;
                    const buy = wa(`Olá! Quero renovar/comprar mais sessões do ${k.name}.`);
                    return (
                      <Card key={i} className="p-4">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                            {k.kind === "plano" ? <Repeat size={18} /> : <Package size={18} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{k.name}</p>
                            {k.total != null ? (
                              <>
                                <p className="text-sm text-muted">
                                  <span className="font-semibold text-ink">{k.used}</span> de {k.total} usadas · {left} restante{left === 1 ? "" : "s"}
                                  {k.expires_on && ` · vence ${formatDateShort(k.expires_on)}`}
                                </p>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (k.used / k.total) * 100)}%`, background: color }} />
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-muted">
                                {formatMoney(k.price_cents)}/mês{k.per_week ? ` · ${k.per_week}x por semana` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        {left != null && left <= 2 && (
                          <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
                            {left <= 0 ? "Seu pacote acabou." : "Seu pacote está acabando."} Renove para manter seus horários.
                          </p>
                        )}
                        {buy && k.total != null && (
                          <a href={buy} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold" style={{ color }}>
                            + Comprar mais sessões
                          </a>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {aba === "aulas" && (
          <>
            <section>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Próximas aulas</h2>
              {d.sessions.length === 0 ? (
                <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma aula marcada nos próximos 30 dias.</Card>
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
    </main>
  );
}
