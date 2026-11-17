import Link from "next/link";
import { Download } from "lucide-react";
import { Badge, buttonClass, Card, cx, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { AttendeeBadge } from "@/components/status";
import { getContext } from "@/lib/context";
import { addDaysISO, formatDateShort, formatTime, monthRange, todayISO } from "@/lib/format";
import { loadAttendances, readFilters, type AttFilters } from "@/lib/attendances";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Atendimentos realizados" };

export default async function AtendimentosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const f = readFilters(sp);
  const supabase = await createClient();
  const [rows, { data: pros }, { data: services }] = await Promise.all([
    loadAttendances(supabase, ctx.clinicId, f),
    supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("services").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
  ]);

  const today = todayISO();
  const month = monthRange(today.slice(0, 7));
  const lastMonth = monthRange(addDaysISO(month.from, -1).slice(0, 7));
  const qs = (over: Partial<AttFilters>) => {
    const p = { ...f, ...over };
    const o: Record<string, string> = { de: p.de, ate: p.ate };
    if (p.pro) o.pro = p.pro;
    if (p.servico) o.servico = p.servico;
    if (p.tipo) o.tipo = p.tipo;
    if (p.sit !== "veio") o.sit = p.sit;
    return new URLSearchParams(o).toString();
  };
  const SHORTCUTS = [
    { label: "Hoje", de: today, ate: today },
    { label: "7 dias", de: addDaysISO(today, -6), ate: today },
    { label: "Este mês", de: month.from, ate: today },
    { label: "Mês passado", de: lastMonth.from, ate: lastMonth.to },
  ];

  const people = new Set(rows.map((r) => r.patients?.id)).size;
  const veio = rows.filter((r) => r.status === "presente").length;
  const faltou = rows.filter((r) => r.status === "falta" || r.status === "desmarcado_fora_prazo").length;
  const isAula = (r: (typeof rows)[number]) => r.appointments.services?.kind === "turma" || r.appointments.capacity > 1;
  const aulas = rows.filter(isAula).length;

  // Agrupar por dia
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(r.appointments.starts_at));
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }

  return (
    <>
      <PageHeader
        title="Atendimentos realizados"
        description="Tudo o que foi feito no período. Filtre e baixe a planilha."
        back={{ href: "/mais", label: "Mais" }}
        action={
          ctx.role !== "profissional" ? (
            <a href={`/exportar/atendimentos?${qs({})}`} className={buttonClass("secondary", "md")}>
              <Download size={18} /> Planilha
            </a>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => {
          const on = f.de === s.de && f.ate === s.ate;
          return (
            <Link
              key={s.label}
              href={`/atendimentos?${qs({ de: s.de, ate: s.ate })}`}
              className={cx(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <Card className="mb-5 p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" action="/atendimentos">
          <Field label="De">
            <Input type="date" name="de" defaultValue={f.de} />
          </Field>
          <Field label="Até">
            <Input type="date" name="ate" defaultValue={f.ate} />
          </Field>
          <Field label="Profissional">
            <Select name="pro" defaultValue={f.pro}>
              <option value="">Todos</option>
              {(pros ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Serviço">
            <Select name="servico" defaultValue={f.servico}>
              <option value="">Todos</option>
              {(services ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select name="tipo" defaultValue={f.tipo}>
              <option value="">Consultas e aulas</option>
              <option value="consultas">Só consultas</option>
              <option value="aulas">Só aulas</option>
            </Select>
          </Field>
          <Field label="Situação">
            <Select name="sit" defaultValue={f.sit}>
              <option value="veio">Veio</option>
              <option value="faltou">Faltou / desmarcou em cima</option>
              <option value="todos">Todos</option>
            </Select>
          </Field>
          <div className="sm:col-span-3 lg:col-span-6">
            <button className={buttonClass("primary", "md")}>Filtrar</button>
          </div>
        </form>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: f.sit === "veio" ? "Atendimentos" : "Registros", value: rows.length },
          { label: "Pacientes diferentes", value: people },
          { label: "Consultas · Aulas", value: `${rows.length - aulas} · ${aulas}` },
          { label: f.sit === "todos" ? "Veio · Faltou" : f.sit === "veio" ? "Dias com atendimento" : "Faltas", value: f.sit === "todos" ? `${veio} · ${faltou}` : f.sit === "veio" ? byDay.size : faltou },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-sm text-muted">{t.label}</p>
            <p className="mt-1 text-[24px] leading-none font-semibold tabular-nums">{t.value}</p>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nada neste período"
          text={f.sit === "veio" ? "Os atendimentos aparecem aqui quando você marca “Veio” na agenda." : "Tente outro período ou tire algum filtro."}
        />
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted">
                {formatDateShort(day)} · {list.length}
              </h2>
              <Card className="divide-y divide-line">
                {list.map((r) => (
                  <Link key={r.id} href={`/agenda/${r.appointments.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-hover">
                    <span className="w-12 shrink-0 text-sm font-medium tabular-nums">{formatTime(r.appointments.starts_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.patients?.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {r.appointments.services?.name} · {r.appointments.professionals?.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {r.is_makeup && <Badge tone="info">reposição</Badge>}
                      {r.patients?.access_via && <Badge>{r.patients.access_via === "wellhub" ? "Wellhub" : "TotalPass"}</Badge>}
                      {f.sit !== "veio" && <AttendeeBadge status={r.status} />}
                    </span>
                  </Link>
                ))}
              </Card>
            </section>
          ))}
          {rows.length >= 5000 && <p className="text-sm text-muted">Mostrando os 5.000 primeiros. Diminua o período para ver tudo.</p>}
        </div>
      )}
    </>
  );
}
