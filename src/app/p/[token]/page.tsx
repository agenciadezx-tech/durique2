import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, FileSignature, Package, RefreshCcw } from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge, Card, cx } from "@/components/ui";
import { formatDateShort, TZ } from "@/lib/format";
import { firstName } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { BookButton, SessionButtons } from "./portal-buttons";

export const metadata = { title: "Minhas aulas", robots: { index: false } };
export const dynamic = "force-dynamic";

type Portal = {
  patient: { name: string };
  clinic: { name: string };
  notice_hours: number;
  sessions: { attendee_id: string; starts_at: string; status: string; service: string; professional: string; is_makeup: boolean }[];
  credits: { expires_on: string }[];
  packages: { name: string; kind: string; total: number | null; used: number; expires_on: string | null }[];
  documents: { title: string; token: string }[];
  open_classes: { appointment_id: string; starts_at: string; service: string; professional: string; free: number }[];
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

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_get", { p_token: token });
  const d = data as Portal | null;
  if (!d) notFound();
  const now = Date.now();
  const credits = d.credits.length;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pt-6 pb-16">
      <header className="mb-6 flex items-center justify-between">
        <Logo compact />
        <span className="text-sm font-medium text-muted">{d.clinic.name}</span>
      </header>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Olá, {firstName(d.patient.name)}!</h1>
      <p className="mt-1 text-[15px] text-muted">Aqui você confirma, desmarca e repõe suas aulas.</p>

      <div className="mt-6 space-y-8">
        {d.documents.length > 0 && (
          <div className="space-y-2">
            {d.documents.map((doc) => (
              <Link key={doc.token} href={`/assinar/${doc.token}`} className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn">
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
          <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
            <CalendarCheck size={20} className="text-accent" /> Próximas aulas
          </h2>
          {d.sessions.length === 0 ? (
            <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma aula marcada nos próximos 30 dias.</Card>
          ) : (
            <div className="space-y-3">
              {d.sessions.map((s) => {
                const st = STATUS[s.status] ?? STATUS.agendado;
                const future = new Date(s.starts_at).getTime() > now;
                const inTime = new Date(s.starts_at).getTime() - now >= d.notice_hours * 36e5;
                const canAct = future && (s.status === "agendado" || s.status === "confirmado");
                return (
                  <Card key={s.attendee_id} className={cx("p-4", !canAct && "opacity-80")}>
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
              })}
            </div>
          )}
          <p className="mt-3 text-[13px] text-muted">
            Desmarcando com pelo menos {d.notice_hours} horas de antecedência você ganha uma reposição.
          </p>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
            <RefreshCcw size={20} className="text-accent" /> Reposições
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
                          {when(c.starts_at).split(",")[0]}, {formatDateShort(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(c.starts_at))).slice(0, 5)} · {hour(c.starts_at)}
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

        {d.packages.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
              <Package size={20} className="text-accent" /> Seu plano
            </h2>
            <div className="space-y-3">
              {d.packages.map((k, i) => (
                <Card key={i} className="p-4">
                  <p className="font-medium">{k.name}</p>
                  {k.total != null ? (
                    <>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (k.used / k.total) * 100)}%` }} />
                      </div>
                      <p className="mt-1.5 text-sm text-muted">
                        {k.total - k.used} de {k.total} sessões restantes{k.expires_on && ` · válido até ${formatDateShort(k.expires_on)}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">Plano mensal ativo</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="mt-10 text-center text-[13px] text-faint">Este link é pessoal. Não compartilhe.</p>
    </main>
  );
}
