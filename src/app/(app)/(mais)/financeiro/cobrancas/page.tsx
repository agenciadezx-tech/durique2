import Link from "next/link";
import { CheckCircle2, Plus, QrCode, Receipt } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PayButton } from "@/components/finance";
import { Alert, Card, cx, EmptyState, LinkButton } from "@/components/ui";
import { WaSendButton } from "@/components/wa-send";
import { getContext } from "@/lib/context";
import { addDaysISO, formatDateShort, formatMoney, monthRange, PAY_LABEL, TZ, todayISO } from "@/lib/format";
import { firstName, renderTemplate } from "@/lib/messages";
import { pixCode, pixMessage, type PixConfig } from "@/lib/pix";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cobranças" };

type Tx = {
  id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  paid_on: string | null;
  payment_method: string | null;
  patients: { id: string; name: string; phone: string | null } | null;
};

const TABS = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "semana", label: "Vencem em 7 dias" },
  { key: "abertas", label: "Todas em aberto" },
  { key: "pagas", label: "Pagas no mês" },
] as const;

const sentLabel = (ts: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export default async function CobrancasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const today = todayISO();
  const week = addDaysISO(today, 7);
  const { from } = monthRange(today.slice(0, 7));
  const supabase = await createClient();
  await supabase.rpc("ensure_plan_charges", { p_clinic: ctx.clinicId });

  const [{ data: openData }, { data: paidData }, { data: settings }, { data: wa }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description, amount_cents, due_date, paid_on, payment_method, patients(id, name, phone), patient_packages(services(punctual_discount_pct))")
      .eq("clinic_id", ctx.clinicId)
      .eq("type", "receita")
      .is("paid_on", null)
      .order("due_date")
      .limit(500),
    supabase
      .from("transactions")
      .select("id, description, amount_cents, due_date, paid_on, payment_method, patients(id, name, phone)")
      .eq("clinic_id", ctx.clinicId)
      .eq("type", "receita")
      .gte("paid_on", from)
      .order("paid_on", { ascending: false })
      .limit(300),
    supabase.from("clinic_settings").select("pix_key, pix_name, pix_city").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("whatsapp_settings").select("tpl_cobranca").eq("clinic_id", ctx.clinicId).maybeSingle(),
  ]);
  const open = (openData ?? []) as unknown as Tx[];
  const paid = (paidData ?? []) as unknown as Tx[];
  const late = open.filter((t) => t.due_date < today);
  const soon = open.filter((t) => t.due_date >= today && t.due_date <= week);
  const sum = (l: Tx[]) => l.reduce((a, t) => a + t.amount_cents, 0);
  const pix: PixConfig | null = settings?.pix_key && settings.pix_name ? { key: settings.pix_key, name: settings.pix_name, city: settings.pix_city } : null;

  const tab = TABS.find((t) => t.key === sp.aba)?.key ?? (late.length ? "atrasadas" : "semana");
  const rows = tab === "atrasadas" ? late : tab === "semana" ? soon : tab === "abertas" ? open : paid;

  const ids = rows.filter((r) => !r.paid_on).map((r) => r.id);
  const { data: logs } = ids.length
    ? await supabase.from("message_log").select("transaction_id, created_at").in("transaction_id", ids).order("created_at")
    : { data: [] as { transaction_id: string | null; created_at: string }[] };
  const sentOf = new Map((logs ?? []).map((l) => [l.transaction_id, l.created_at]));

  const tiles = [
    { key: "atrasadas", label: "Atrasado", value: sum(late), hint: `${late.length} cobrança${late.length === 1 ? "" : "s"}`, tone: late.length ? "text-bad" : "" },
    { key: "semana", label: "Vence em 7 dias", value: sum(soon), hint: `${soon.length} cobrança${soon.length === 1 ? "" : "s"}`, tone: "" },
    { key: "pagas", label: "Recebido no mês", value: sum(paid), hint: `${paid.length} pagamento${paid.length === 1 ? "" : "s"}`, tone: "text-ok" },
  ];

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Cobranças</h1>
          <p className="mt-1 text-[15px] text-muted">Quem está devendo, cobrar pelo WhatsApp e dar baixa.</p>
        </div>
        <LinkButton href="/financeiro/novo?tipo=receita" variant="secondary" size="md">
          <Plus size={18} /> Nova cobrança
        </LinkButton>
      </header>

      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {tiles.map((t) => (
            <Link
              key={t.key}
              href={`/financeiro/cobrancas?aba=${t.key}`}
              className={cx(
                "rounded-2xl border bg-surface p-3 transition-colors hover:border-faint sm:p-4",
                tab === t.key ? "border-accent ring-1 ring-accent" : "border-line",
              )}
            >
              <p className="text-[13px] text-muted sm:text-sm">{t.label}</p>
              <p className={cx("mt-0.5 text-[15px] font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-[22px]", t.tone)}>{formatMoney(t.value)}</p>
              <p className="text-[12px] text-muted sm:text-[13px]">{t.hint}</p>
            </Link>
          ))}
        </div>

        {!pix && ctx.isAdmin && (
          <Alert tone="info">
            <span className="flex flex-wrap items-center gap-x-2">
              <QrCode size={18} className="shrink-0" />
              Cadastre a chave Pix da clínica para as cobranças saírem com o Pix copia e cola.{" "}
              <Link href="/ajustes/pix" className="font-semibold underline">
                Cadastrar agora
              </Link>
            </span>
          </Alert>
        )}

        <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-line" aria-label="Filtrar cobranças">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/financeiro/cobrancas?aba=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cx(
                "-mb-px border-b-2 px-3 py-3 text-[15px] font-medium whitespace-nowrap transition-colors",
                tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.key === "atrasadas" && late.length > 0 && (
                <span className="ml-1.5 rounded-full bg-bad-soft px-1.5 text-[12px] font-semibold text-bad">{late.length}</span>
              )}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <EmptyState
            icon={tab === "atrasadas" ? <CheckCircle2 size={22} /> : <Receipt size={22} />}
            title={
              tab === "atrasadas"
                ? "Ninguém atrasado. Ótimo!"
                : tab === "semana"
                  ? "Nada vencendo nos próximos 7 dias"
                  : tab === "abertas"
                    ? "Nenhuma cobrança em aberto"
                    : "Nada recebido neste mês ainda"
            }
            text={
              tab === "pagas"
                ? "Os pagamentos aparecem aqui assim que você dá baixa."
                : "Cobranças aparecem quando você vende um pacote, um plano gera mensalidade ou lança uma receita."
            }
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {rows.map((t) => {
              const p = t.patients;
              const isLate = !t.paid_on && t.due_date < today;
              const days = Math.round((Date.parse(today) - Date.parse(t.due_date)) / 864e5);
              const body =
                renderTemplate(wa?.tpl_cobranca ?? "", {
                  nome: p ? firstName(p.name) : "",
                  descricao: t.description,
                  valor: formatMoney(t.amount_cents),
                  vencimento: formatDateShort(t.due_date),
                  clinica: ctx.clinicName,
                }) +
                punctualLine(t, today) +
                pixMessage(pix, t.amount_cents, t.id.slice(0, 8));
              return (
                <div key={t.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5", isLate && "bg-bad-soft/30")}>
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    {p ? (
                      <Link href={`/pacientes/${p.id}`} className="block truncate font-medium hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <p className="truncate font-medium">{t.description}</p>
                    )}
                    <p className={cx("text-sm", isLate ? "text-bad" : "text-muted")}>
                      {p && `${t.description} · `}
                      {t.paid_on
                        ? `pago em ${formatDateShort(t.paid_on)}${t.payment_method ? ` · ${PAY_LABEL[t.payment_method] ?? t.payment_method}` : ""}`
                        : isLate
                          ? `venceu ${formatDateShort(t.due_date)} (${days} dia${days === 1 ? "" : "s"})`
                          : t.due_date === today
                            ? "vence hoje"
                            : `vence ${formatDateShort(t.due_date)}`}
                      {sentOf.has(t.id) && <span className="text-muted"> · cobrado {sentLabel(sentOf.get(t.id)!)}</span>}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <span className="mr-1 font-semibold tabular-nums">{formatMoney(t.amount_cents)}</span>
                    {!t.paid_on && (
                      <>
                        {p?.phone && (
                          <WaSendButton phone={p.phone} body={body} kind="cobranca" patientId={p.id} transactionId={t.id} sentAt={sentOf.get(t.id)} label="Cobrar" />
                        )}
                        {pix && <CopyButton text={pixCode(pix, t.amount_cents, t.id.slice(0, 8))} label="Copiar Pix" />}
                        <PayButton id={t.id} type="receita" amountLabel={formatMoney(t.amount_cents)} back="/financeiro/cobrancas" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
        {tab !== "pagas" && rows.length > 0 && (
          <p className="text-[13px] text-muted">
            &quot;Cobrar&quot; abre o WhatsApp com a mensagem{pix ? " e o Pix copia e cola" : ""} prontos. Quando o paciente pagar, toque em
            &quot;Receber&quot; para dar baixa.
          </p>
        )}
      </div>
    </>
  );
}

/** Desconto pontualidade do serviço: “pagando até o vencimento, sai por …” (só antes de vencer). */
function punctualLine(t: unknown, today: string) {
  const x = t as { amount_cents: number; due_date: string; patient_packages?: { services?: { punctual_discount_pct: number | null } | null } | null };
  const pct = x.patient_packages?.services?.punctual_discount_pct;
  if (!pct || x.due_date < today) return "";
  return `\n\nPagando até ${formatDateShort(x.due_date)}, sai por ${formatMoney(Math.round(x.amount_cents * (1 - Number(pct) / 100)))} (${Number(pct)}% de desconto).`;
}
