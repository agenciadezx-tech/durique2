import { Download, LogOut, Package, Plus, Stethoscope, UserRound } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { saveTemplates } from "../whatsapp/actions";
import { TEMPLATE_VARS } from "@/lib/messages";
import { Avatar, Badge, Card, Field, Input, PageHeader, Section, Select, Textarea } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatPhone } from "@/lib/format";
import { renameClinic, saveRules, saveDocTemplate, saveProduct, saveProfessional, saveService, toggleActive } from "./actions";
import { CommissionFields, ProductFields } from "./product-fields";

export const metadata = { title: "Ajustes" };

function Disclosure({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-hover [&::-webkit-details-marker]:hidden">
        {summary}
        <span className="ml-auto text-sm text-muted group-open:hidden">Editar</span>
        <span className="ml-auto hidden text-sm text-muted group-open:inline">Fechar</span>
      </summary>
      <div className="border-t border-line bg-bg/60 px-4 py-5">{children}</div>
    </details>
  );
}

function ServiceFields({ s }: { s?: { name: string; kind: string; duration_min: number; default_capacity: number; price_cents: number | null } }) {
  return (
    <>
      <Field label="Nome" htmlFor={`sn-${s?.name ?? "novo"}`}>
        <Input id={`sn-${s?.name ?? "novo"}`} name="name" required defaultValue={s?.name} placeholder="Ex.: Pilates em turma" />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Tipo">
          <Select name="kind" defaultValue={s?.kind ?? "individual"}>
            <option value="individual">Individual</option>
            <option value="turma">Turma</option>
          </Select>
        </Field>
        <Field label="Duração (min)">
          <Input name="duration_min" type="number" min={5} max={480} step={5} required defaultValue={s?.duration_min ?? 50} />
        </Field>
        <Field label="Vagas (turma)">
          <Input name="default_capacity" type="number" min={1} max={50} defaultValue={s?.default_capacity ?? 4} />
        </Field>
        <Field label="Preço (R$)">
          <Input name="price" inputMode="decimal" placeholder="Opcional" defaultValue={s?.price_cents != null ? (s.price_cents / 100).toFixed(2).replace(".", ",") : ""} />
        </Field>
      </div>
    </>
  );
}

export default async function AjustesPage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const [{ data: pros }, { data: services }, { data: products }, { data: wa }, { data: docTemplates }] = await Promise.all([
    supabase.from("professionals").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("services").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("products").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("whatsapp_settings").select("*").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("document_templates").select("id, name, body").eq("clinic_id", ctx.clinicId).order("name"),
  ]);
  const { data: rules } = await supabase.from("clinic_settings").select("*").eq("clinic_id", ctx.clinicId).maybeSingle();
  const activeServices = (services ?? []).filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const admin = ctx.isAdmin;

  return (
    <>
      <PageHeader title="Ajustes" description="Sua clínica, equipe e serviços." />
      <div className="space-y-10">
        <Section title="Clínica">
          <Card className="p-5 sm:p-6">
            <ActionForm action={renameClinic}>
              <Field label="Nome da clínica" htmlFor="clinic-name">
                <Input id="clinic-name" name="name" defaultValue={ctx.clinicName} disabled={!admin} required />
              </Field>
              {admin && <SubmitButton size="md">Salvar nome</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>

        <Section title="Profissionais">
          <Card className="divide-y divide-line overflow-hidden">
            {(pros ?? []).map((p) => (
              <Disclosure
                key={p.id}
                summary={
                  <>
                    <Avatar name={p.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-sm text-muted">
                        {p.commission_percent != null
                          ? `Comissão ${Number(p.commission_percent)}%`
                          : p.commission_fixed_cents != null
                            ? `Comissão ${formatMoney(p.commission_fixed_cents)}/sessão`
                            : formatPhone(p.phone) || p.email || "Sem contato"}
                      </p>
                    </div>
                    {!p.active && <Badge>Inativo</Badge>}
                  </>
                }
              >
                {admin ? (
                  <div className="space-y-4">
                    <ActionForm action={saveProfessional}>
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Nome">
                        <Input name="name" required defaultValue={p.name} />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="WhatsApp">
                          <Input name="phone" type="tel" defaultValue={formatPhone(p.phone)} />
                        </Field>
                        <Field label="E-mail">
                          <Input name="email" type="email" defaultValue={p.email ?? ""} />
                        </Field>
                        <Field label="CREFITO" hint="Aparece nos registros do prontuário.">
                          <Input name="crefito" defaultValue={p.crefito ?? ""} placeholder="Ex.: 123456-F" />
                        </Field>
                      </div>
                      <CommissionFields percent={p.commission_percent} fixedCents={p.commission_fixed_cents} />
                      <SubmitButton size="md">Salvar</SubmitButton>
                    </ActionForm>
                    <form action={toggleActive}>
                      <input type="hidden" name="table" value="professionals" />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <SubmitButton variant="ghost" size="sm" className="text-muted" pendingText="Aguarde…">
                        {p.active ? "Desativar profissional" : "Reativar profissional"}
                      </SubmitButton>
                    </form>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Somente o administrador pode editar.</p>
                )}
              </Disclosure>
            ))}
            {admin && (
              <Disclosure
                summary={
                  <span className="flex items-center gap-3 font-medium text-accent">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                      <Plus size={18} />
                    </span>
                    Adicionar profissional
                  </span>
                }
              >
                <ActionForm action={saveProfessional} resetOnSuccess>
                  <Field label="Nome">
                    <Input name="name" required placeholder="Ex.: Carlos Lima" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="WhatsApp">
                      <Input name="phone" type="tel" placeholder="(11) 99999-8888" />
                    </Field>
                    <Field label="E-mail">
                      <Input name="email" type="email" />
                    </Field>
                    <Field label="CREFITO">
                      <Input name="crefito" placeholder="Ex.: 123456-F" />
                    </Field>
                  </div>
                  <CommissionFields />
                  <SubmitButton size="md">Adicionar</SubmitButton>
                </ActionForm>
              </Disclosure>
            )}
          </Card>
          {!pros?.length && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <UserRound size={16} /> Cadastre pelo menos um profissional para montar a agenda.
            </p>
          )}
        </Section>

        <Section title="Serviços">
          <Card className="divide-y divide-line overflow-hidden">
            {(services ?? []).map((s) => (
              <Disclosure
                key={s.id}
                summary={
                  <>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-hover text-muted">
                      <Stethoscope size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-sm text-muted">
                        {s.kind === "turma" ? `Turma · ${s.default_capacity} vagas` : "Individual"} · {s.duration_min} min
                        {s.price_cents != null && ` · ${formatMoney(s.price_cents)}`}
                      </p>
                    </div>
                    {!s.active && <Badge>Inativo</Badge>}
                  </>
                }
              >
                {admin ? (
                  <div className="space-y-4">
                    <ActionForm action={saveService}>
                      <input type="hidden" name="id" value={s.id} />
                      <ServiceFields s={s} />
                      <SubmitButton size="md">Salvar</SubmitButton>
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
              </Disclosure>
            ))}
            {admin && (
              <Disclosure
                summary={
                  <span className="flex items-center gap-3 font-medium text-accent">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                      <Plus size={18} />
                    </span>
                    Adicionar serviço
                  </span>
                }
              >
                <ActionForm action={saveService} resetOnSuccess>
                  <ServiceFields />
                  <SubmitButton size="md">Adicionar</SubmitButton>
                </ActionForm>
              </Disclosure>
            )}
          </Card>
        </Section>

        <Section title="Regras da agenda">
          <Card className="p-5 sm:p-6">
            <ActionForm action={saveRules}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Antecedência para desmarcar sem perder a sessão" hint="Em horas. Desmarcou com menos que isso conta como sessão.">
                  <Input name="cancel_notice_hours" type="number" min={0} max={72} defaultValue={rules?.cancel_notice_hours ?? 12} disabled={!admin} />
                </Field>
                <Field label="Validade da reposição" hint="Em dias, a partir da aula desmarcada.">
                  <Input name="makeup_validity_days" type="number" min={1} max={365} defaultValue={rules?.makeup_validity_days ?? 30} disabled={!admin} />
                </Field>
              </div>
              {admin && <SubmitButton size="md">Salvar regras</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>

        <Section title="Pacotes e planos">
          <Card className="divide-y divide-line overflow-hidden">
            {(products ?? []).map((p) => (
              <Disclosure
                key={p.id}
                summary={
                  <>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                      <Package size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-sm text-muted">
                        {p.kind === "plano"
                          ? `Plano mensal · ${p.sessions_per_week}x/semana · ${formatMoney(p.price_cents)}/mês`
                          : `${p.sessions} sessões · ${formatMoney(p.price_cents)}${p.validity_days ? ` · validade ${p.validity_days} dias` : ""}`}
                      </p>
                    </div>
                    {!p.active && <Badge>Inativo</Badge>}
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
            ))}
            {admin && (
              <Disclosure
                summary={
                  <span className="flex items-center gap-3 font-medium text-accent">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                      <Plus size={18} />
                    </span>
                    Adicionar pacote ou plano
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
          {!products?.length && (
            <p className="text-sm text-muted">Cadastre o que a clínica vende (ex.: pacote de 10 sessões, pilates 2x/semana) para vender aos pacientes.</p>
          )}
        </Section>

        <Section title="Modelos de documentos">
          <Card className="divide-y divide-line overflow-hidden">
            {(docTemplates ?? []).map((t) => (
              <Disclosure key={t.id} summary={<span className="font-medium">{t.name}</span>}>
                <ActionForm action={saveDocTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <Field label="Nome">
                    <Input name="name" defaultValue={t.name} disabled={!admin} />
                  </Field>
                  <Field label="Texto" hint="Pode usar {paciente}, {cpf}, {clinica}, {cidade} e {data}.">
                    <Textarea name="body" rows={8} defaultValue={t.body} disabled={!admin} />
                  </Field>
                  {admin && <SubmitButton size="md">Salvar</SubmitButton>}
                </ActionForm>
              </Disclosure>
            ))}
            {admin && (
              <Disclosure
                summary={
                  <span className="flex items-center gap-3 font-medium text-accent">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                      <Plus size={18} />
                    </span>
                    Novo modelo
                  </span>
                }
              >
                <ActionForm action={saveDocTemplate} resetOnSuccess>
                  <Field label="Nome">
                    <Input name="name" required placeholder="Ex.: Termo de pilates" />
                  </Field>
                  <Field label="Texto" hint="Pode usar {paciente}, {cpf}, {clinica}, {cidade} e {data}.">
                    <Textarea name="body" rows={8} required />
                  </Field>
                  <SubmitButton size="md">Criar modelo</SubmitButton>
                </ActionForm>
              </Disclosure>
            )}
          </Card>
        </Section>

        <section id="whatsapp" className="scroll-mt-20 space-y-3">
          <h2 className="text-[17px] font-semibold">WhatsApp</h2>
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-bg p-4">
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-warn" aria-hidden />
              <div className="text-[15px]">
                <p className="font-medium">Envio assistido</p>
                <p className="text-muted">
                  As mensagens saem prontas e você envia pelo WhatsApp da clínica, na tela WhatsApp. O envio automático (com respostas 1/2 que
                  atualizam a agenda sozinhas) chega quando o número for conectado.
                </p>
              </div>
            </div>
            {wa && (
              <ActionForm action={saveTemplates}>
                {(
                  [
                    { k: "tpl_lembrete", t: "Lembrete de sessão", v: TEMPLATE_VARS.lembrete },
                    { k: "tpl_cobranca", t: "Cobrança", v: TEMPLATE_VARS.cobranca },
                    { k: "tpl_renovacao", t: "Fim de pacote", v: TEMPLATE_VARS.renovacao },
                  ] as const
                ).map((f) => (
                  <Field key={f.k} label={f.t} hint={"Pode usar: " + f.v.map((x) => `{${x.key}} = ${x.label}`).join(" · ")}>
                    <Textarea name={f.k} rows={3} defaultValue={wa[f.k]} disabled={!admin} />
                  </Field>
                ))}
                {admin && <SubmitButton size="md">Salvar textos</SubmitButton>}
              </ActionForm>
            )}
          </Card>
        </section>

        <Section title="Sua conta">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="truncate font-medium">{ctx.email}</p>
              <p className="text-sm text-muted">{ROLE_LABEL[ctx.role]}</p>
            </div>
            <form action="/auth/sair" method="post">
              <button className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-hover hover:text-ink">
                <LogOut size={18} /> Sair
              </button>
            </form>
          </Card>
          <Card className="p-5">
            <p className="font-medium">Seus dados são seus</p>
            <p className="mt-1 text-sm text-muted">Baixe tudo em planilhas quando quiser, sem pedir a ninguém.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { t: "pacientes", l: "Pacientes" },
                { t: "sessoes", l: "Sessões e presenças" },
                ...(ctx.canSeeExpenses ? [{ t: "financeiro", l: "Financeiro" }] : []),
              ].map((x) => (
                <a key={x.t} href={`/exportar/${x.t}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-hover">
                  <Download size={16} /> {x.l}
                </a>
              ))}
            </div>
          </Card>
          <p className="text-[13px] text-faint">Convidar recepção e outros profissionais com login chega na próxima etapa.</p>
        </Section>
      </div>
    </>
  );
}
