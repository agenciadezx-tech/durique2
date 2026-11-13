import { LogOut, Plus, Stethoscope, UserRound } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, Field, Input, PageHeader, Section, Select } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatPhone } from "@/lib/format";
import { renameClinic, saveProfessional, saveService, toggleActive } from "./actions";

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
  const [{ data: pros }, { data: services }] = await Promise.all([
    supabase.from("professionals").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("services").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
  ]);
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
                      <p className="truncate text-sm text-muted">{formatPhone(p.phone) || p.email || "Sem contato"}</p>
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
                      </div>
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
                  </div>
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
          <p className="text-[13px] text-faint">Convidar recepção e outros profissionais com login chega na próxima etapa.</p>
        </Section>
      </div>
    </>
  );
}
