import Link from "next/link";
import { ArrowLeft, Package, Plus, Repeat, Search, Stethoscope, Tags, Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, buttonClass, Card, cx, EmptyState, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney, WEEKDAYS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveProduct, saveService, toggleActive } from "../(mais)/ajustes/actions";
import { ProductFields } from "../(mais)/ajustes/product-fields";
import { Disclosure, ServiceFields } from "../(mais)/ajustes/shared";

export const metadata = { title: "Catálogo" };

type Service = {
  id: string;
  name: string;
  kind: string;
  duration_min: number;
  default_capacity: number;
  price_cents: number | null;
  active: boolean;
  cancel_notice_hours: number | null;
};
type Product = {
  id: string;
  name: string;
  kind: string;
  price_cents: number;
  service_id: string | null;
  sessions: number | null;
  validity_days: number | null;
  sessions_per_week: number | null;
  active: boolean;
};
type Series = {
  id: string;
  service_id: string;
  weekday: number;
  start_time: string;
  capacity: number;
  professionals: { name: string } | null;
  enrollments: { ends_on: string | null }[];
};

const productLine = (p: Product) =>
  p.kind === "plano"
    ? `Plano mensal · ${p.sessions_per_week}x por semana · ${formatMoney(p.price_cents)}/mês`
    : `${p.sessions} sessões · ${formatMoney(p.price_cents)}${p.validity_days ? ` · vale ${p.validity_days} dias` : ""}`;

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string; q?: string; novo?: string }> }) {
  const ctx = await getContext();
  const admin = ctx.isAdmin;
  const sp = await searchParams;
  const tab = sp.t === "consultas" || sp.t === "aulas" ? sp.t : "todos";
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: sData }, { data: pData }, { data: seriesData }] = await Promise.all([
    supabase.from("services").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("products").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase
      .from("recurring_series")
      .select("id, service_id, weekday, start_time, capacity, professionals(name), enrollments(ends_on)")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("weekday")
      .order("start_time"),
  ]);
  const services = (sData ?? []) as Service[];
  const products = (pData ?? []) as Product[];
  const series = (seriesData ?? []) as unknown as Series[];
  const activeServices = services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const general = products.filter((p) => !p.service_id);
  const isAula = (s: Service) => s.kind === "turma";
  const studentsOf = (sid: string) =>
    series.filter((r) => r.service_id === sid).reduce((n, r) => n + r.enrollments.filter((e) => !e.ends_on || e.ends_on >= today).length, 0);

  const missingOf = (s: Service) => {
    const own = products.filter((p) => p.service_id === s.id && p.active);
    const m: string[] = [];
    if (s.active && s.price_cents == null && own.length === 0 && !general.some((p) => p.active)) m.push("Sem preço");
    if (s.active && isAula(s) && !series.some((r) => r.service_id === s.id)) m.push("Sem turma");
    if (s.active && isAula(s) && !own.some((p) => p.kind === "plano")) m.push("Sem plano mensal");
    return m;
  };

  const selected = sp.s === "novo" || sp.s === "geral" ? sp.s : services.find((s) => s.id === sp.s) ?? null;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { t: tab === "todos" ? undefined : tab, q: sp.q || undefined, s: typeof selected === "string" ? selected : selected?.id, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `/catalogo?${str}` : "/catalogo";
  };

  const visible = services.filter((s) => (tab === "todos" ? true : tab === "aulas" ? isAula(s) : !isAula(s)) && (!q || s.name.toLowerCase().includes(q)));
  const groups = [
    { key: "consultas", title: "Consultas", dot: "bg-chart-in", icon: Stethoscope, list: visible.filter((s) => !isAula(s)) },
    { key: "aulas", title: "Aulas", dot: "bg-chart-out", icon: Users, list: visible.filter(isAula) },
  ];

  // ===== Lista (esquerda) =====
  const list = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 pb-3 lg:pt-8">
        <div>
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted">O que a clínica vende: preços, pacotes, planos e turmas.</p>
        </div>
        <form action="/catalogo" className="relative">
          {tab !== "todos" && <input type="hidden" name="t" value={tab} />}
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Buscar serviço…"
            aria-label="Buscar serviço"
            className="h-11 w-full rounded-xl border border-line bg-bg pr-3 pl-10 text-[16px] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </form>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-hover p-1" role="tablist" aria-label="Tipo">
          {(
            [
              { k: "todos", label: "Todos", dot: null },
              { k: "consultas", label: "Consultas", dot: "bg-chart-in" },
              { k: "aulas", label: "Aulas", dot: "bg-chart-out" },
            ] as const
          ).map((o) => (
            <Link
              key={o.k}
              role="tab"
              aria-selected={tab === o.k}
              href={qs({ t: o.k === "todos" ? undefined : o.k })}
              className={cx(
                "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium",
                tab === o.k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />}
              {o.label}
            </Link>
          ))}
        </div>
        {admin && (
          <Link href={qs({ s: "novo" })} className={buttonClass("primary", "md", true)}>
            <Plus size={18} /> Novo serviço
          </Link>
        )}
      </div>

      <div className="flex-1 space-y-5 px-2 pb-8 lg:overflow-y-auto">
        {services.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted">Nenhum serviço ainda. Comece pelo que a clínica mais faz, como Sessão de fisioterapia ou Pilates.</p>
        )}
        {services.length > 0 && visible.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nada encontrado com “{sp.q}”.</p>}
        {groups.map((g) =>
          g.list.length === 0 ? null : (
            <section key={g.key}>
              <h2 className="mb-1 flex items-center gap-2 px-3 text-[12px] font-semibold tracking-wide text-muted uppercase">
                <span className={cx("size-2 rounded-full", g.dot)} /> {g.title} · {g.list.filter((s) => s.active).length}
              </h2>
              <ul>
                {g.list.map((s) => {
                  const own = products.filter((p) => p.service_id === s.id && p.active);
                  const missing = missingOf(s);
                  const on = typeof selected === "object" && selected?.id === s.id;
                  const sub = isAula(s)
                    ? `${s.default_capacity} vagas · ${own.filter((p) => p.kind === "plano").length} planos · ${studentsOf(s.id)} alunos`
                    : `${s.duration_min} min · ${own.length} pacote${own.length === 1 ? "" : "s"}`;
                  const from = own.length ? Math.min(...own.map((p) => p.price_cents)) : null;
                  return (
                    <li key={s.id}>
                      <Link
                        href={qs({ s: s.id })}
                        aria-current={on ? "page" : undefined}
                        className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5", on ? "bg-accent-soft" : "hover:bg-hover", !s.active && "opacity-60")}
                      >
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-accent text-white" : "bg-hover text-muted")}>
                          <g.icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.name}</span>
                          <span className="block truncate text-[13px] text-muted">{sub}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          {s.price_cents != null ? (
                            <>
                              <span className="block text-sm font-semibold tabular-nums">{formatMoney(s.price_cents)}</span>
                              <span className="block text-[11px] text-muted">avulsa</span>
                            </>
                          ) : from != null ? (
                            <>
                              <span className="block text-[11px] text-muted">a partir de</span>
                              <span className="block text-sm font-semibold tabular-nums">{formatMoney(from)}</span>
                            </>
                          ) : null}
                          {!s.active && <span className="block text-[11px] text-muted">inativo</span>}
                          {missing.length > 0 && (
                            <span className="mt-0.5 inline-block rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">
                              Falta {missing.length}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
        {(general.length > 0 || (admin && services.length > 0)) && (
          <section>
            <h2 className="mb-1 px-3 text-[12px] font-semibold tracking-wide text-muted uppercase">Outros</h2>
            <Link
              href={qs({ s: "geral" })}
              aria-current={selected === "geral" ? "page" : undefined}
              className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5", selected === "geral" ? "bg-accent-soft" : "hover:bg-hover")}
            >
              <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", selected === "geral" ? "bg-accent text-white" : "bg-hover text-muted")}>
                <Package size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Pacotes para qualquer serviço</span>
                <span className="block text-[13px] text-muted">{general.filter((p) => p.active).length} à venda</span>
              </span>
            </Link>
          </section>
        )}
      </div>
    </div>
  );

  function ProductItem({ p }: { p: Product }) {
    return (
      <Disclosure
        summary={
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              {p.kind === "plano" ? <Repeat size={16} /> : <Package size={16} />}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-sm text-muted">{productLine(p)}</p>
            </div>
            {!p.active && <Badge>Fora de venda</Badge>}
          </>
        }
      >
        {admin ? (
          <div className="space-y-4">
            <ActionForm action={saveProduct}>
              <input type="hidden" name="id" value={p.id} />
              <ProductFields p={p} services={activeServices} />
              <SubmitButton size="md">Salvar</SubmitButton>
            </ActionForm>
            <form action={toggleActive}>
              <input type="hidden" name="table" value="products" />
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={String(!p.active)} />
              <SubmitButton variant="ghost" size="sm" className="text-muted" pendingText="Aguarde…">
                {p.active ? "Parar de vender" : "Voltar a vender"}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted">Somente o administrador pode editar.</p>
        )}
      </Disclosure>
    );
  }

  function NewProduct({ serviceId, label }: { serviceId?: string; label: string }) {
    if (!admin) return null;
    return (
      <Disclosure
        label=""
        summary={
          <span className="flex items-center gap-2 text-sm font-medium text-accent">
            <Plus size={16} /> {label}
          </span>
        }
      >
        <ActionForm action={saveProduct} resetOnSuccess>
          <ProductFields services={activeServices} defaultServiceId={serviceId} />
          <SubmitButton size="md">Adicionar</SubmitButton>
        </ActionForm>
      </Disclosure>
    );
  }

  // ===== Detalhe (direita) =====
  let detail: React.ReactNode;
  if (selected === "novo" && admin) {
    detail = (
      <>
        <h2 className="text-[22px] font-semibold tracking-tight">Novo serviço</h2>
        <p className="mb-6 text-[15px] text-muted">Depois de salvar você coloca os pacotes, planos e turmas dele.</p>
        <Card className="p-5">
          <ActionForm action={saveService}>
            <input type="hidden" name="goto" value="catalogo" />
            <ServiceFields />
            <SubmitButton size="md">Criar serviço</SubmitButton>
          </ActionForm>
        </Card>
      </>
    );
  } else if (selected === "geral") {
    detail = (
      <>
        <h2 className="text-[22px] font-semibold tracking-tight">Pacotes para qualquer serviço</h2>
        <p className="mb-6 text-[15px] text-muted">Valem para qualquer atendimento da clínica (ex.: 10 sessões de qualquer tipo).</p>
        <Card className="divide-y divide-line overflow-hidden">
          {general.map((p) => (
            <ProductItem key={p.id} p={p} />
          ))}
          {general.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nenhum ainda.</p>}
          <NewProduct label="Novo pacote ou plano" />
        </Card>
      </>
    );
  } else if (selected && typeof selected === "object") {
    const s = selected;
    const own = products.filter((p) => p.service_id === s.id);
    const turmas = series.filter((r) => r.service_id === s.id);
    const missing = missingOf(s);
    const Icon = isAula(s) ? Users : Stethoscope;
    detail = (
      <>
        {sp.novo && (
          <div className="mb-4">
            <Alert tone="ok">Serviço criado. Agora coloque os preços{isAula(s) ? ", o plano mensal e as turmas" : " e os pacotes"}.</Alert>
          </div>
        )}
        <header className="mb-6 flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] leading-tight font-semibold tracking-tight">{s.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted">
              <span className={cx("size-2.5 rounded-full", isAula(s) ? "bg-chart-out" : "bg-chart-in")} />
              {isAula(s) ? `Aula em grupo · ${s.default_capacity} vagas` : "Consulta individual"} · {s.duration_min} min
              {s.price_cents != null && ` · avulsa ${formatMoney(s.price_cents)}`}
              {!s.active && <Badge>Inativo</Badge>}
            </p>
          </div>
        </header>

        <div className="space-y-8">
          {missing.length > 0 && (
            <Card className="border-warn/40 bg-warn-soft/40 p-4">
              <p className="font-medium text-warn">Falta para ficar pronto</p>
              <ul className="mt-1 list-inside list-disc text-[15px]">
                {missing.map((m) => (
                  <li key={m}>
                    {m === "Sem preço"
                      ? "Coloque o preço da sessão avulsa ou crie um pacote"
                      : m === "Sem turma"
                        ? "Crie pelo menos uma turma (dia e horário fixos)"
                        : "Crie o plano mensal (ex.: 2x por semana)"}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Section title={isAula(s) ? "Planos e pacotes" : "Pacotes"}>
            <Card className="divide-y divide-line overflow-hidden">
              {own.map((p) => (
                <ProductItem key={p.id} p={p} />
              ))}
              {own.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nenhum ainda. Só a sessão avulsa.</p>}
              <NewProduct serviceId={s.id} label={isAula(s) ? "Novo plano mensal ou pacote" : "Novo pacote de sessões"} />
            </Card>
          </Section>

          {isAula(s) && (
            <Section
              title={`Turmas · ${turmas.length}`}
              action={
                ctx.canManageAgenda ? (
                  <Link href="/horarios/novo" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
                    <Plus size={16} /> Nova turma
                  </Link>
                ) : undefined
              }
            >
              {turmas.length === 0 ? (
                <Card className="p-4 text-[15px] text-muted">Nenhuma turma ainda. Crie o dia e o horário fixos em Turmas.</Card>
              ) : (
                <Card className="divide-y divide-line">
                  {turmas.map((r) => {
                    const n = r.enrollments.filter((e) => !e.ends_on || e.ends_on >= today).length;
                    return (
                      <Link key={r.id} href={`/horarios/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {WEEKDAYS[r.weekday]} · {r.start_time.slice(0, 5)}
                          </span>
                          <span className="block text-sm text-muted">{r.professionals?.name}</span>
                        </span>
                        <span className="text-sm font-medium tabular-nums">
                          {n}/{r.capacity} alunos
                        </span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover">
                          <span className="block h-full rounded-full bg-chart-out" style={{ width: `${Math.min(100, (n / r.capacity) * 100)}%` }} />
                        </span>
                      </Link>
                    );
                  })}
                </Card>
              )}
            </Section>
          )}

          <Section title="Preço e regras">
            {admin ? (
              <Card className="p-5">
                <ActionForm action={saveService}>
                  <input type="hidden" name="id" value={s.id} />
                  <ServiceFields s={s} />
                  <SubmitButton size="md">Salvar</SubmitButton>
                </ActionForm>
                <form action={toggleActive} className="mt-4 border-t border-line pt-4">
                  <input type="hidden" name="table" value="services" />
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.active)} />
                  <SubmitButton variant="ghost" size="sm" className="text-muted" pendingText="Aguarde…">
                    {s.active ? "Desativar serviço" : "Reativar serviço"}
                  </SubmitButton>
                </form>
              </Card>
            ) : (
              <Card className="p-4 text-sm text-muted">Somente o administrador pode editar.</Card>
            )}
          </Section>
        </div>
      </>
    );
  } else {
    detail = (
      <div className="hidden min-h-[70vh] lg:flex">
        <EmptyState
          icon={<Tags size={22} />}
          title={services.length ? "Escolha um serviço" : "Comece pelo primeiro serviço"}
          text={services.length ? "Toque em um item da lista para ver preços, pacotes, planos e turmas." : "Ex.: Sessão de fisioterapia (50 min) ou Pilates em turma (4 vagas)."}
          action={
            admin && !services.length ? (
              <Link href="/catalogo?s=novo" className={buttonClass("primary", "md")}>
                <Plus size={18} /> Novo serviço
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const hasDetail = !!selected;
  return (
    <div data-split className="lg:flex lg:h-dvh">
      <aside className={cx("shrink-0 border-line bg-surface lg:block lg:h-dvh lg:w-[360px] lg:border-r", hasDetail ? "hidden" : "min-h-dvh pb-24 lg:pb-0")}>{list}</aside>
      <div className={cx("min-w-0 flex-1 px-5 pt-6 pb-28 lg:block lg:overflow-y-auto lg:px-10 lg:pt-10 lg:pb-16", !hasDetail && "hidden")}>
        <div className="mx-auto w-full max-w-3xl">
          {hasDetail && (
            <Link href={qs({ s: undefined, novo: undefined })} className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink lg:hidden">
              <ArrowLeft size={16} /> Catálogo
            </Link>
          )}
          {detail}
        </div>
      </div>
    </div>
  );
}
