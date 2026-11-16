import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Minus, Plus } from "lucide-react";
import { Card, cx, LinkButton, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addMonthsKey, formatDateShort, formatMoney, formatMonth, formatMonthShort, monthRange, PAY_LABEL, todayISO } from "@/lib/format";
import { MonthNav } from "./month-nav";
import { InOutChart, MonthPaceChart, type MonthFlow } from "@/components/finance-charts";

export const metadata = { title: "Financeiro" };

type Tx = {
  id: string;
  type: "receita" | "despesa";
  description: string;
  amount_cents: number;
  due_date: string;
  paid_on: string | null;
  payment_method: string | null;
  patients: { name: string } | null;
  categories?: { name: string } | null;
};

function Stat({ label, value, hint, tone, href }: { label: string; value: number; hint?: string; tone?: "ok" | "bad" | "warn"; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full p-4 transition-colors hover:border-faint sm:p-5">
        <p className="text-sm text-muted">{label}</p>
        <p
          className={cx(
            "mt-1 text-[22px] font-semibold tracking-tight tabular-nums sm:text-[24px]",
            tone === "ok" && "text-ok",
            tone === "bad" && "text-bad",
          )}
        >
          {formatMoney(value)}
        </p>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </Card>
    </Link>
  );
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await getContext();
  const { mes } = await searchParams;
  const today = todayISO();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const showExp = ctx.canSeeExpenses;
  const supabase = await createClient();

  await supabase.rpc("ensure_plan_charges", { p_clinic: ctx.clinicId });

  const horizon = monthRange(addMonthsKey(today.slice(0, 7), 2)).to;
  const sixFrom = monthRange(addMonthsKey(month, -5)).from;
  const [{ data: monthTx }, { data: openTx }, { data: paidAll }, { data: sixTx }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, description, amount_cents, due_date, paid_on, payment_method, patients(name), categories(name)")
      .eq("clinic_id", ctx.clinicId)
      .or(`and(paid_on.gte.${from},paid_on.lte.${to}),and(paid_on.is.null,due_date.gte.${from},due_date.lte.${to})`),
    supabase
      .from("transactions")
      .select("id, type, description, amount_cents, due_date, paid_on, payment_method, patients(name)")
      .eq("clinic_id", ctx.clinicId)
      .is("paid_on", null)
      .lte("due_date", horizon)
      .order("due_date"),
    supabase.from("transactions").select("type, amount_cents").eq("clinic_id", ctx.clinicId).not("paid_on", "is", null),
    supabase
      .from("transactions")
      .select("type, amount_cents, paid_on")
      .eq("clinic_id", ctx.clinicId)
      .gte("paid_on", sixFrom)
      .lte("paid_on", to),
  ]);

  const mtx = (monthTx ?? []) as unknown as Tx[];
  const sum = (list: Tx[]) => list.reduce((a, t) => a + t.amount_cents, 0);
  const recebido = sum(mtx.filter((t) => t.type === "receita" && t.paid_on));
  const aReceber = sum(mtx.filter((t) => t.type === "receita" && !t.paid_on));
  const pago = sum(mtx.filter((t) => t.type === "despesa" && t.paid_on));
  const aPagar = sum(mtx.filter((t) => t.type === "despesa" && !t.paid_on));

  const open = (openTx ?? []) as unknown as Tx[];
  const late = open.filter((t) => t.due_date < today);
  const lateIn = late.filter((t) => t.type === "receita");
  const lateOut = late.filter((t) => t.type === "despesa");

  // Saldo em caixa (tudo que já entrou − tudo que já saiu) e previsão dos próximos 3 meses
  const caixa = (paidAll ?? []).reduce((a, t) => a + (t.type === "receita" ? t.amount_cents : -t.amount_cents), 0);
  const curKey = today.slice(0, 7);
  const months = [0, 1, 2].map((i) => addMonthsKey(curKey, i));
  let running = caixa;
  const forecast = months.map((k, i) => {
    const inMonth = (t: Tx) => (i === 0 ? t.due_date <= monthRange(k).to : t.due_date.startsWith(k)); // atrasados entram no mês atual
    const entra = sum(open.filter((t) => t.type === "receita" && inMonth(t)));
    const sai = sum(open.filter((t) => t.type === "despesa" && inMonth(t)));
    running += entra - sai;
    return { k, entra, sai, saldo: running };
  });
  const maxBar = Math.max(1, ...forecast.flatMap((f) => [f.entra, f.sai]));

  // Recebido no mês por forma de pagamento
  const byMethod = new Map<string, number>();
  mtx
    .filter((t) => t.type === "receita" && t.paid_on)
    .forEach((t) => byMethod.set(t.payment_method ?? "outro", (byMethod.get(t.payment_method ?? "outro") ?? 0) + t.amount_cents));
  const methods = [...byMethod.entries()].sort((a, b) => b[1] - a[1]);

  // Últimos 6 meses (terminando no mês escolhido)
  const flows: MonthFlow[] = [-5, -4, -3, -2, -1, 0].map((n) => {
    const k = addMonthsKey(month, n);
    const list = (sixTx ?? []).filter((t) => t.paid_on?.startsWith(k));
    return {
      key: k,
      label: formatMonthShort(k),
      full: formatMonth(k),
      in: list.filter((t) => t.type === "receita").reduce((a, t) => a + t.amount_cents, 0),
      out: showExp ? list.filter((t) => t.type === "despesa").reduce((a, t) => a + t.amount_cents, 0) : 0,
    };
  });

  // Ritmo do mês: quanto já entrou até cada dia
  const daysInMonth = Number(to.slice(8, 10));
  const isFuture = month > curKey;
  const todayIdx = month === curKey ? Number(today.slice(8, 10)) - 1 : daysInMonth - 1;
  let acc = 0;
  const pace = Array.from({ length: daysInMonth }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, "0")}`;
    acc += mtx.filter((t) => t.type === "receita" && t.paid_on === day).reduce((a, t) => a + t.amount_cents, 0);
    return { label: String(i + 1), total: acc };
  });

  // Despesas do mês por categoria
  const byCat = new Map<string, number>();
  mtx
    .filter((t) => t.type === "despesa" && t.paid_on)
    .forEach((t) => byCat.set(t.categories?.name ?? "Sem categoria", (byCat.get(t.categories?.name ?? "Sem categoria") ?? 0) + t.amount_cents));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  const expected = recebido + aReceber;
  const pct = expected > 0 ? Math.round((recebido / expected) * 100) : 0;

  const lanc = (tipo: string) => `/financeiro/lancamentos?tipo=${tipo}&mes=${month}`;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Financeiro</h1>
        <div className="flex gap-2">
          <LinkButton href="/financeiro/novo?tipo=receita" variant="secondary" size="md">
            <Plus size={18} /> Receita
          </LinkButton>
          {showExp && (
            <LinkButton href="/financeiro/novo?tipo=despesa" variant="secondary" size="md">
              <Minus size={18} /> Despesa
            </LinkButton>
          )}
        </div>
      </header>

      <div className="mb-4 flex justify-center sm:justify-start">
        <MonthNav month={month} base="/financeiro" />
      </div>

      <div className="space-y-8">
        <div className={cx("grid gap-3", showExp ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}>
          <Stat label="Recebido" value={recebido} tone="ok" href={lanc("recebidos")} />
          <Stat label="A receber" value={aReceber} hint="ainda neste mês" href={lanc("receber")} />
          {showExp && <Stat label="Pago" value={pago} href={lanc("pagos")} />}
          {showExp && <Stat label="A pagar" value={aPagar} hint="ainda neste mês" href={lanc("pagar")} />}
        </div>

        {expected > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-[15px]">
                <span className="font-semibold">Já entrou {pct}%</span>{" "}
                <span className="text-muted">do que está previsto para {formatMonth(month).toLowerCase()}</span>
              </p>
              <p className="text-sm text-muted tabular-nums">
                {formatMoney(recebido)} de {formatMoney(expected)}
              </p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-chart-in transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            {aReceber > 0 && (
              <p className="mt-2 text-[13px] text-muted">
                Falta receber {formatMoney(aReceber)}.{" "}
                <Link href="/financeiro/cobrancas?aba=abertas" className="font-medium text-accent hover:underline">
                  Ver quem falta pagar
                </Link>
              </p>
            )}
          </Card>
        )}

        {showExp && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm text-muted">Resultado do mês (recebido − pago)</p>
              <p className={cx("text-[26px] font-semibold tabular-nums", recebido - pago >= 0 ? "text-ok" : "text-bad")}>
                {formatMoney(recebido - pago)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Saldo em caixa hoje</p>
              <p className={cx("text-[20px] font-semibold tabular-nums", caixa < 0 && "text-bad")}>{formatMoney(caixa)}</p>
            </div>
          </Card>
        )}

        {(lateIn.length > 0 || (showExp && lateOut.length > 0)) && (
          <Section title="Atrasados">
            <Card className="divide-y divide-line overflow-hidden border-bad/20">
              {lateIn.length > 0 && (
                <Link href="/financeiro/cobrancas?aba=atrasadas" className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                  <AlertTriangle size={20} className="text-bad" />
                  <span className="flex-1">
                    <span className="font-medium">{lateIn.length} cobrança{lateIn.length === 1 ? "" : "s"} vencida{lateIn.length === 1 ? "" : "s"}</span>
                    <span className="block text-sm text-muted">
                      {lateIn
                        .slice(0, 3)
                        .map((t) => t.patients?.name ?? t.description)
                        .join(", ")}
                      {lateIn.length > 3 && "…"}
                    </span>
                  </span>
                  <span className="font-semibold text-bad tabular-nums">{formatMoney(sum(lateIn))}</span>
                </Link>
              )}
              {showExp && lateOut.length > 0 && (
                <Link href="/financeiro/lancamentos?tipo=pagar&atrasados=1" className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                  <AlertTriangle size={20} className="text-warn" />
                  <span className="flex-1 font-medium">
                    {lateOut.length} conta{lateOut.length === 1 ? "" : "s"} a pagar vencida{lateOut.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(sum(lateOut))}</span>
                </Link>
              )}
            </Card>
          </Section>
        )}

        <Section title={showExp ? "Entrou e saiu, mês a mês" : "Recebido mês a mês"}>
          <Card className="p-5">
            <InOutChart data={flows} showOut={showExp} />
          </Card>
        </Section>

        {!isFuture && (
          <Section title={`Dinheiro entrando em ${formatMonth(month).toLowerCase()}`}>
            <Card className="p-5">
              <MonthPaceChart days={pace} todayIndex={todayIdx} />
            </Card>
          </Section>
        )}

        {showExp && (
          <Section title="Previsão de saldo">
            <Card className="p-5">
              <p className="mb-4 text-sm text-muted">
                Com base no que está lançado para receber e pagar. Hoje há {formatMoney(caixa)} em caixa.
              </p>
              <div className="mb-4 flex gap-4 text-[13px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-chart-in" /> Entradas previstas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-chart-out" /> Saídas previstas
                </span>
              </div>
              <ul className="space-y-5">
                {forecast.map((f, i) => (
                  <li key={f.k} className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5 sm:grid-cols-[4.5rem_1fr_9rem] sm:items-center">
                    <span className="row-span-2 pt-0.5 text-[15px] font-medium sm:row-span-1 sm:pt-0">
                      {i === 0 ? "Este mês" : formatMonthShort(f.k).replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2" title={`Entradas: ${formatMoney(f.entra)}`}>
                        <div className="h-3 rounded-r bg-chart-in" style={{ width: `${Math.max(1, (f.entra / maxBar) * 100)}%` }} />
                        <span className="text-[13px] whitespace-nowrap text-muted tabular-nums">{formatMoney(f.entra)}</span>
                      </div>
                      <div className="flex items-center gap-2" title={`Saídas: ${formatMoney(f.sai)}`}>
                        <div className="h-3 rounded-r bg-chart-out" style={{ width: `${Math.max(1, (f.sai / maxBar) * 100)}%` }} />
                        <span className="text-[13px] whitespace-nowrap text-muted tabular-nums">{formatMoney(f.sai)}</span>
                      </div>
                    </div>
                    <p className="text-[15px] sm:text-right">
                      <span className="text-[13px] text-muted">Saldo previsto </span>
                      <span className={cx("font-semibold whitespace-nowrap tabular-nums", f.saldo < 0 && "text-bad")}>{formatMoney(f.saldo)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Recebido por forma de pagamento">
            <Card className="p-4">
              {methods.length ? (
                <ul className="space-y-3">
                  {methods.map(([m, v]) => (
                    <li key={m}>
                      <div className="mb-1 flex justify-between gap-3 text-[15px]">
                        <span>{PAY_LABEL[m] ?? m}</span>
                        <span className="tabular-nums">
                          <span className="font-medium">{formatMoney(v)}</span>{" "}
                          <span className="text-sm text-muted">{Math.round((v / recebido) * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-hover">
                        <div className="h-full rounded-full bg-chart-in" style={{ width: `${(v / methods[0][1]) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-[15px] text-muted">Nada recebido neste mês ainda.</p>
              )}
            </Card>
          </Section>

          {showExp && (
            <Section title="Para onde foi o dinheiro">
              <Card className="p-4">
                {cats.length ? (
                  <ul className="space-y-3">
                    {cats.map(([c, v]) => (
                      <li key={c}>
                        <div className="mb-1 flex justify-between gap-3 text-[15px]">
                          <span className="truncate">{c}</span>
                          <span className="tabular-nums">
                            <span className="font-medium">{formatMoney(v)}</span>{" "}
                            <span className="text-sm text-muted">{Math.round((v / pago) * 100)}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-hover">
                          <div className="h-full rounded-full bg-chart-out" style={{ width: `${(v / cats[0][1]) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-[15px] text-muted">Nenhuma despesa paga neste mês.</p>
                )}
              </Card>
            </Section>
          )}

          <Section title="Próximos vencimentos">
            <Card className="divide-y divide-line">
              {open.filter((t) => t.due_date >= today && (showExp || t.type === "receita")).length ? (
                open
                  .filter((t) => t.due_date >= today && (showExp || t.type === "receita"))
                  .slice(0, 6)
                  .map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-[15px]">
                      {t.type === "receita" ? (
                        <ArrowDownLeft size={18} className="shrink-0 text-ok" aria-label="Receber" />
                      ) : (
                        <ArrowUpRight size={18} className="shrink-0 text-muted" aria-label="Pagar" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{t.patients?.name ?? t.description}</span>
                      <span className="text-sm text-muted">{formatDateShort(t.due_date).slice(0, 5)}</span>
                      <span className="font-medium tabular-nums">{formatMoney(t.amount_cents)}</span>
                    </div>
                  ))
              ) : (
                <p className="px-4 py-5 text-[15px] text-muted">Nenhum vencimento próximo.</p>
              )}
            </Card>
          </Section>
        </div>
      </div>
    </>
  );
}
