import { redirect } from "next/navigation";
import { Badge, buttonClass, Card, Field, Input, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { addDaysISO, formatDayLong, todayISO } from "@/lib/format";
import { nationalHolidays } from "@/lib/holidays";
import { createClient } from "@/lib/supabase/server";
import { setClosedDay } from "../actions";

export const metadata = { title: "Feriados e dias fechados" };

export default async function FeriadosPage() {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/ajustes");
  const today = todayISO();
  const until = addDaysISO(today, 366);
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_blocks")
    .select("id, starts_at, reason")
    .eq("clinic_id", ctx.clinicId)
    .is("professional_id", null)
    .gte("starts_at", `${today}T00:00:00-03:00`)
    .order("starts_at");
  const dayOf = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));
  const closed = new Map((data ?? []).map((b) => [dayOf(b.starts_at), b.reason ?? "Fechado"]));
  const y = Number(today.slice(0, 4));
  const holidays = [...nationalHolidays(y), ...nationalHolidays(y + 1)].filter((h) => h.date >= today && h.date <= until);
  const hset = new Set(holidays.map((h) => h.date));
  const others = [...closed.entries()].filter(([d]) => !hset.has(d));

  return (
    <>
      <PageHeader
        title="Feriados e dias fechados"
        description="Nos dias fechados ninguém consegue marcar pelo link. As sessões já marcadas continuam; remarque se precisar."
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <div className="space-y-8">
        <Section title="Outro dia fechado">
          <Card className="p-4">
            <form action={setClosedDay} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <Field label="Dia">
                <Input type="date" name="date" min={today} required />
              </Field>
              <Field label="Motivo">
                <Input name="reason" maxLength={120} placeholder="Ex.: Aniversário da cidade, recesso" />
              </Field>
              <button className={buttonClass("primary", "md")}>Fechar este dia</button>
            </form>
          </Card>
          {others.length > 0 && (
            <Card className="divide-y divide-line">
              {others.map(([d, reason]) => (
                <div key={d} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{formatDayLong(d)}</span>
                    <span className="text-sm text-muted">{reason}</span>
                  </span>
                  <form action={setClosedDay}>
                    <input type="hidden" name="date" value={d} />
                    <input type="hidden" name="open" value="1" />
                    <button className={buttonClass("ghost", "sm")}>Abrir</button>
                  </form>
                </div>
              ))}
            </Card>
          )}
        </Section>

        <Section title="Feriados nacionais dos próximos 12 meses">
          <Card className="divide-y divide-line">
            {holidays.map((h) => {
              const isClosed = closed.has(h.date);
              return (
                <div key={h.date} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{h.name}</span>
                    <span className="text-sm text-muted">{formatDayLong(h.date)}</span>
                  </span>
                  {isClosed ? <Badge tone="warn">Fechado</Badge> : <Badge tone="ok">Aberto</Badge>}
                  <form action={setClosedDay}>
                    <input type="hidden" name="date" value={h.date} />
                    <input type="hidden" name="reason" value={h.name} />
                    {isClosed && <input type="hidden" name="open" value="1" />}
                    <button className={buttonClass("secondary", "sm")}>{isClosed ? "Abrir" : "Fechar"}</button>
                  </form>
                </div>
              );
            })}
          </Card>
          <p className="px-1 text-[13px] text-muted">Feriados estaduais e municipais: use “Outro dia fechado”.</p>
        </Section>
      </div>
    </>
  );
}
