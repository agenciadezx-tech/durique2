import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, Package, Receipt, Settings2 } from "lucide-react";
import { Card, cx, EmptyState } from "@/components/ui";
import { WaSendButton } from "@/components/wa-send";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, dayRange, formatDateShort, formatTime, isoWeekday, todayISO, TZ, WEEKDAYS } from "@/lib/format";
import { firstName, renderTemplate } from "@/lib/messages";
import { ReminderStatus } from "./reminder-status";

export const metadata = { title: "WhatsApp" };

const TABS = [
  { key: "lembretes", label: "Lembretes", icon: BellRing },
  { key: "cobrancas", label: "Cobranças", icon: Receipt },
  { key: "renovacoes", label: "Renovações", icon: Package },
] as const;

const dayLabel = (iso: string) => `${WEEKDAYS[isoWeekday(iso)].toLowerCase()}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const sentLabel = (ts: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ aba?: string; d?: string }> }) {
  const ctx = await getContext();
  if (ctx.role === "profissional") redirect("/agenda");
  const sp = await searchParams;
  // Cobranças ficam num lugar só: Financeiro → Cobranças
  if (sp.aba === "cobrancas") redirect("/financeiro/cobrancas");
  const tab = TABS.find((t) => t.key === sp.aba)?.key ?? "lembretes";
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const day = sp.d === "hoje" ? today : tomorrow;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("whatsapp_settings").select("*").eq("clinic_id", ctx.clinicId).single();
  const tpl = settings ?? { tpl_lembrete: "", tpl_cobranca: "", tpl_renovacao: "" };

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Central do WhatsApp</h1>
          <p className="text-[15px] text-muted">Toque em Enviar: o WhatsApp abre com a mensagem pronta. É só apertar enviar lá.</p>
        </div>
        <Link href="/whatsapp/avisos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <Settings2 size={16} /> Avisos e textos
        </Link>
      </header>

      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Tipos de mensagem">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/whatsapp?aba=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cx(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-[15px] font-medium whitespace-nowrap",
              tab === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon size={17} /> {label}
          </Link>
        ))}
      </nav>

      {tab === "lembretes" && <Lembretes day={day} isToday={day === today} tpl={tpl.tpl_lembrete} clinic={ctx.clinicName} clinicId={ctx.clinicId} />}
      {tab === "renovacoes" && <Renovacoes today={today} tpl={tpl.tpl_renovacao} clinic={ctx.clinicName} clinicId={ctx.clinicId} />}
    </>
  );
}

type Att = {
  id: string;
  status: string;
  patients: { id: string; name: string; phone: string | null; portal_token: string } | null;
  appointments: { id: string; starts_at: string; services: { name: string } | null; professionals: { name: string } | null };
};

async function Lembretes({ day, isToday, tpl, clinic, clinicId }: { day: string; isToday: boolean; tpl: string; clinic: string; clinicId: string }) {
  const supabase = await createClient();
  const { from, to } = dayRange(day);
  const { data } = await supabase
    .from("appointment_attendees")
    .select("id, status, patients(id, name, phone, portal_token, skip_confirmation), appointments!inner(id, starts_at, status, services(name), professionals(name))")
    .eq("clinic_id", clinicId)
    .gte("appointments.starts_at", from)
    .lt("appointments.starts_at", to)
    .eq("appointments.status", "agendado")
    .in("status", ["agendado", "confirmado", "desmarcado_no_prazo", "desmarcado_fora_prazo"]);
  const rows = ((data ?? []) as unknown as (Att & { patients: { skip_confirmation?: boolean } | null })[])
    .filter((r) => !r.patients?.skip_confirmation)
    .sort((a, b) =>
    a.appointments.starts_at === b.appointments.starts_at
      ? (a.patients?.name ?? "").localeCompare(b.patients?.name ?? "")
      : a.appointments.starts_at.localeCompare(b.appointments.starts_at),
  );
  const ids = rows.map((r) => r.id);
  const { data: logs } = ids.length
    ? await supabase.from("message_log").select("attendee_id, created_at").in("attendee_id", ids).order("created_at")
    : { data: [] as { attendee_id: string | null; created_at: string }[] };
  const sentOf = new Map((logs ?? []).map((l) => [l.attendee_id, l.created_at]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const withPhone = rows.filter((r) => r.patients?.phone);
  const sentCount = withPhone.filter((r) => sentOf.has(r.id)).length;
  const confirmed = rows.filter((r) => r.status === "confirmado").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-hover p-1">
          {[
            { k: "amanha", l: "Amanhã", on: !isToday },
            { k: "hoje", l: "Hoje", on: isToday },
          ].map((o) => (
            <Link
              key={o.k}
              href={`/whatsapp?aba=lembretes&d=${o.k}`}
              className={cx("rounded-lg px-4 py-1.5 text-sm font-medium", o.on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {o.l}
            </Link>
          ))}
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{sentCount}</span> de {withPhone.length} enviados ·{" "}
            <span className="font-semibold text-info">{confirmed}</span> confirmados
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarClock size={22} />} title={`Nenhuma sessão ${isToday ? "hoje" : "amanhã"}`} text="Os lembretes aparecem aqui conforme a agenda." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const p = r.patients!;
            const body = renderTemplate(tpl, {
              nome: firstName(p.name),
              servico: r.appointments.services?.name,
              dia: isToday ? "hoje" : `amanhã (${dayLabel(day)})`,
              hora: formatTime(r.appointments.starts_at),
              profissional: r.appointments.professionals?.name,
              clinica: clinic,
              link: `${origin}/p/${p.portal_token}`,
            });
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span className="w-12 shrink-0 font-semibold tabular-nums">{formatTime(r.appointments.starts_at)}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/agenda/${r.appointments.id}`} className="block truncate font-medium hover:underline">
                    {p.name}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {r.appointments.services?.name}
                    {sentOf.has(r.id) && ` · enviado ${sentLabel(sentOf.get(r.id)!)}`}
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <ReminderStatus attendeeId={r.id} appointmentId={r.appointments.id} status={r.status} />
                  {p.phone ? (
                    <WaSendButton phone={p.phone} body={body} kind="lembrete" patientId={p.id} attendeeId={r.id} sentAt={sentOf.get(r.id)} />
                  ) : (
                    <Link href={`/pacientes/${p.id}`} className="text-sm text-muted underline">
                      Sem WhatsApp
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <p className="mt-4 text-[13px] text-faint">
        Quando o paciente responder, toque em “Confirmou” ou “Desmarcou”. O envio automático, sem precisar tocar em nada, chega quando o número da
        clínica for conectado.
      </p>
    </>
  );
}

type Pkg = {
  id: string;
  name: string;
  total_sessions: number | null;
  expires_on: string | null;
  patients: { id: string; name: string; phone: string | null } | null;
};

async function Renovacoes({ today, tpl, clinic, clinicId }: { today: string; tpl: string; clinic: string; clinicId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_packages")
    .select("id, name, total_sessions, expires_on, patients(id, name, phone)")
    .eq("clinic_id", clinicId)
    .eq("status", "ativo")
    .eq("kind", "pacote");
  const pkgs = (data ?? []) as unknown as Pkg[];
  const { data: usage } = pkgs.length
    ? await supabase.from("package_usage").select("package_id, used").in("package_id", pkgs.map((p) => p.id))
    : { data: [] as { package_id: string; used: number }[] };
  const used = new Map((usage ?? []).map((u) => [u.package_id, u.used]));
  const soon = addDaysISO(today, 7);
  const rows = pkgs
    .map((p) => ({ ...p, left: p.total_sessions != null ? p.total_sessions - (used.get(p.id) ?? 0) : null }))
    .filter((p) => (p.left != null && p.left <= 2) || (p.expires_on && p.expires_on <= soon))
    .sort((a, b) => (a.left ?? 99) - (b.left ?? 99));
  const ids = rows.map((r) => r.id);
  const { data: logs } = ids.length
    ? await supabase.from("message_log").select("package_id, created_at").in("package_id", ids).order("created_at")
    : { data: [] as { package_id: string | null; created_at: string }[] };
  const sentOf = new Map((logs ?? []).map((l) => [l.package_id, l.created_at]));

  if (!rows.length) return <EmptyState icon={<Package size={22} />} title="Nenhum pacote acabando" text="Aparecem aqui pacotes com 2 sessões ou menos, ou que vencem em até 7 dias." />;
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rows.map((r) => {
        const p = r.patients!;
        const body = renderTemplate(tpl, {
          nome: firstName(p.name),
          restantes: r.left ?? "",
          pacote: r.name,
          validade: r.expires_on ? formatDateShort(r.expires_on) : "",
          clinica: clinic,
        });
        const expired = r.expires_on && r.expires_on < today;
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
            <div className="min-w-0 flex-1 basis-full sm:basis-0">
              <Link href={`/pacientes/${p.id}`} className="block truncate font-medium hover:underline">
                {p.name}
              </Link>
              <p className="text-sm text-muted">
                {r.name} ·{" "}
                <span className={cx(r.left != null && r.left <= 0 ? "text-bad" : "text-warn")}>
                  {r.left != null && r.left <= 0 ? "sessões acabaram" : r.left != null ? `${r.left} restante${r.left === 1 ? "" : "s"}` : ""}
                </span>
                {r.expires_on && ` · ${expired ? "venceu" : "vence"} ${formatDateShort(r.expires_on)}`}
                {sentOf.has(r.id) && ` · avisado ${sentLabel(sentOf.get(r.id)!)}`}
              </p>
            </div>
            <div className="ml-auto">
              {p.phone ? (
                <WaSendButton phone={p.phone} body={body} kind="renovacao" patientId={p.id} packageId={r.id} sentAt={sentOf.get(r.id)} label="Avisar" />
              ) : (
                <span className="text-sm text-muted">Sem WhatsApp</span>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
