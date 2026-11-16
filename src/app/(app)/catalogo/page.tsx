import { Package, Plus, Repeat, Stethoscope, Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, cx, EmptyState, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveProduct, saveService, toggleActive } from "../ajustes/actions";
import { ProductFields } from "../ajustes/product-fields";
import { Disclosure, ServiceFields } from "../ajustes/shared";

export const metadata = { title: "Catálogo" };

type Service = { id: string; name: string; kind: string; duration_min: number; default_capacity: number; price_cents: number | null; active: boolean };
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

const productLine = (p: Product) =>
  p.kind === "plano"
    ? `Plano mensal · ${p.sessions_per_week}x por semana · ${formatMoney(p.price_cents)}/mês`
    : `${p.sessions} sessões · ${formatMoney(p.price_cents)}${p.validity_days ? ` · vale ${p.validity_days} dias` : ""}`;

export default async function CatalogoPage() {
  const ctx = await getContext();
  const admin = ctx.isAdmin;
  const supabase = await createClient();
  const [{ data: sData }, { data: pData }, { data: series }] = await Promise.all([
    supabase.from("services").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("products").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("recurring_series").select("service_id").eq("clinic_id", ctx.clinicId).eq("active", true),
  ]);
  const services = (sData ?? []) as Service[];
  const products = (pData ?? []) as Product[];
  const activeServices = services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const turmasOf = new Map<string, number>();
  (series ?? []).forEach((r) => turmasOf.set(r.service_id, (turmasOf.get(r.service_id) ?? 0) + 1));

  const groups = [
    { kind: "individual", title: "Consultas", hint: "Atendimento individual (fisioterapia, avaliação, RPG…)", icon: Stethoscope, dot: "bg-chart-in" },
    { kind: "turma", title: "Aulas", hint: "Em grupo, com vagas (pilates, funcional…)", icon: Users, dot: "bg-chart-out" },
  ] as const;
  const general = products.filter((p) => !p.service_id);

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

  return (
    <>
      <PageHeader title="Catálogo" description="Tudo o que a clínica oferece: serviços, preço avulso, pacotes e planos." />
      <div className="space-y-10">
        {admin && (
          <Card className="overflow-hidden">
            <Disclosure
              label=""
              summary={
                <span className="flex items-center gap-3 font-medium text-accent">
                  <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                    <Plus size={18} />
                  </span>
                  Novo serviço
                </span>
              }
            >
              <ActionForm action={saveService} resetOnSuccess>
                <ServiceFields />
                <SubmitButton size="md">Adicionar</SubmitButton>
              </ActionForm>
            </Disclosure>
          </Card>
        )}

        {services.length === 0 && (
          <EmptyState
            icon={<Stethoscope size={22} />}
            title="Nenhum serviço ainda"
            text="Comece pelo que a clínica mais faz. Ex.: Sessão de fisioterapia (50 min) ou Pilates em turma (4 vagas)."
          />
        )}

        {groups.map((g) => {
          const list = services.filter((s) => (g.kind === "turma" ? s.kind === "turma" : s.kind !== "turma"));
          if (!list.length) return null;
          return (
            <Section key={g.kind} title={`${g.title} · ${list.filter((s) => s.active).length}`}>
              <p className="-mt-2 flex items-center gap-2 text-sm text-muted">
                <span className={cx("size-2.5 rounded-full", g.dot)} /> {g.hint}
              </p>
              <div className="space-y-3">
                {list.map((s) => {
                  const own = products.filter((p) => p.service_id === s.id);
                  const sellable = own.filter((p) => p.active);
                  const missing: string[] = [];
                  if (s.active && s.price_cents == null && sellable.length === 0 && !general.some((p) => p.active)) missing.push("sem preço");
                  if (s.active && s.kind === "turma" && !turmasOf.get(s.id)) missing.push("sem turma criada");
                  return (
                    <Card key={s.id} className={cx("overflow-hidden", !s.active && "opacity-70")}>
                      <Disclosure
                        summary={
                          <>
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-hover text-muted">
                              <g.icon size={18} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{s.name}</p>
                              <p className="truncate text-sm text-muted">
                                {s.duration_min} min{s.kind === "turma" ? ` · ${s.default_capacity} vagas` : ""}
                                {s.kind === "turma" && turmasOf.get(s.id) ? ` · ${turmasOf.get(s.id)} turma${turmasOf.get(s.id) === 1 ? "" : "s"}` : ""}
                                {sellable.length > 0 && ` · ${sellable.length} pacote${sellable.length === 1 ? "" : "s"}/plano${sellable.length === 1 ? "" : "s"}`}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {s.price_cents != null ? (
                                <>
                                  <p className="font-semibold tabular-nums">{formatMoney(s.price_cents)}</p>
                                  <p className="text-[12px] text-muted">avulsa</p>
                                </>
                              ) : sellable[0] ? (
                                <>
                                  <p className="text-[12px] text-muted">a partir de</p>
                                  <p className="font-semibold tabular-nums">
                                    {formatMoney(Math.min(...sellable.map((p) => p.price_cents)))}
                                    {sellable.every((p) => p.kind === "plano") ? "/mês" : ""}
                                  </p>
                                </>
                              ) : null}
                              {!s.active && <Badge>Inativo</Badge>}
                              {missing.map((m) => (
                                <span key={m} className="mt-0.5 block rounded-full bg-warn-soft px-2 text-[11px] font-semibold text-warn uppercase">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </>
                        }
                      >
                        <div className="space-y-6">
                          {admin ? (
                            <div className="space-y-3">
                              <ActionForm action={saveService}>
                                <input type="hidden" name="id" value={s.id} />
                                <ServiceFields s={s} />
                                <SubmitButton size="md">Salvar serviço</SubmitButton>
                              </ActionForm>
                              <form action={toggleActive}>
                                <input type="hidden" name="table" value="services" />
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="active" value={String(!s.active)} />
                                <SubmitButton variant="ghost" size="sm" className="text-muted" pendingText="Aguarde…">
                                  {s.active ? "Desativar serviço" : "Reativar serviço"}
                                </SubmitButton>
                              </form>
                            </div>
                          ) : (
                            <p className="text-sm text-muted">Somente o administrador pode editar.</p>
                          )}
                          <div>
                            <p className="mb-2 text-sm font-semibold">Pacotes e planos deste serviço</p>
                            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                              {own.map((p) => (
                                <ProductItem key={p.id} p={p} />
                              ))}
                              {own.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nenhum ainda. Só a sessão avulsa.</p>}
                              {admin && (
                                <Disclosure
                                  label=""
                                  summary={
                                    <span className="flex items-center gap-2 text-sm font-medium text-accent">
                                      <Plus size={16} /> {s.kind === "turma" ? "Novo plano mensal ou pacote" : "Novo pacote de sessões"}
                                    </span>
                                  }
                                >
                                  <ActionForm action={saveProduct} resetOnSuccess>
                                    <ProductFields services={activeServices} defaultServiceId={s.id} />
                                    <SubmitButton size="md">Adicionar</SubmitButton>
                                  </ActionForm>
                                </Disclosure>
                              )}
                            </div>
                          </div>
                        </div>
                      </Disclosure>
                    </Card>
                  );
                })}
              </div>
            </Section>
          );
        })}

        {(general.length > 0 || (admin && services.length > 0)) && (
          <Section title="Valem para qualquer serviço">
            <Card className="divide-y divide-line overflow-hidden">
              {general.map((p) => (
                <ProductItem key={p.id} p={p} />
              ))}
              {general.length === 0 && <p className="px-4 py-3 text-sm text-muted">Pacotes que servem para qualquer atendimento aparecem aqui.</p>}
              {admin && (
                <Disclosure
                  label=""
                  summary={
                    <span className="flex items-center gap-2 text-sm font-medium text-accent">
                      <Plus size={16} /> Novo pacote ou plano
                    </span>
                  }
                >
                  <ActionForm action={saveProduct} resetOnSuccess>
                    <ProductFields services={activeServices} />
                    <SubmitButton size="md">Adicionar</SubmitButton>
                  </ActionForm>
                </Disclosure>
              )}
            </Card>
          </Section>
        )}
      </div>
    </>
  );
}
