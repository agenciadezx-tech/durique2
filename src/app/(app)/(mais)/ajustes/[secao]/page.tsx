import Link from "next/link";
import { Download, LogOut, Plus, UserPlus, UserRound } from "lucide-react";
import { headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";
import { ConfirmSubmit } from "@/components/forms";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, Field, Input, PageHeader, Section, Select, Textarea } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatPhone } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { saveApps, savePix, createInvite, revokeInvite, setMemberActive, renameClinic, saveRules, saveDocTemplate, saveProfessional, toggleActive } from "../actions";
import { ColorField, CommissionFields } from "../product-fields";
import { Disclosure } from "../shared";
import { proColor } from "@/lib/colors";
import { PIX_KEY_TYPES } from "@/lib/pix";

export const metadata = { title: "Ajustes" };

const TITLES: Record<string, { t: string; d: string }> = {
  clinica: { t: "Dados e avaliação no Google", d: "Nome da clínica e link para pedir avaliação." },
  equipe: { t: "Equipe e acessos", d: "Quem usa o sistema e o que cada pessoa vê." },
  profissionais: { t: "Profissionais e comissões", d: "Quem atende, cor na agenda e comissão." },
  regras: { t: "Regras de desmarcar e reposição", d: "Antecedência para desmarcar e validade da reposição." },
  pix: { t: "Pix para receber", d: "Chave usada no Pix copia e cola das cobranças." },
  apps: { t: "Wellhub e TotalPass", d: "Aplicativos de academia que trazem alunos." },
  documentos: { t: "Contratos e termos", d: "Modelos que o paciente assina pelo celular." },
  conta: { t: "Sua conta e exportar dados", d: "Sair do sistema e baixar planilhas." },
};

export default async function AjustesSecaoPage({ params }: { params: Promise<{ secao: string }> }) {
  const { secao } = await params;
  if (secao === "equipe" || secao === "profissionais") redirect("/equipe");
  if (!TITLES[secao]) notFound();
  const ctx = await getContext();
  const supabase = await createClient();
  const [{ data: pros }, { data: docTemplates }] = await Promise.all([
    supabase.from("professionals").select("*").eq("clinic_id", ctx.clinicId).order("active", { ascending: false }).order("name"),
    supabase.from("document_templates").select("id, name, body").eq("clinic_id", ctx.clinicId).order("name"),
  ]);
  const admin = ctx.isAdmin;
  const { data: clinicRow } = await supabase.from("clinics").select("review_url").eq("id", ctx.clinicId).single();
  const { data: rules } = await supabase.from("clinic_settings").select("*").eq("clinic_id", ctx.clinicId).maybeSingle();
  type Member = { member_id: string; user_id: string; email: string; role: string; active: boolean; professional_name: string | null };
  const members: Member[] = admin ? (((await supabase.rpc("clinic_members", { p_clinic: ctx.clinicId })).data ?? []) as Member[]) : [];
  const { data: invites } = admin
    ? await supabase
        .from("invites")
        .select("id, email, role, token, expires_at")
        .eq("clinic_id", ctx.clinicId)
        .is("accepted_at", null)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; email: string; role: string; token: string; expires_at: string }[] };
  const hh = await headers();
  const origin = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}`;

  return (
    <>
      <PageHeader title={TITLES[secao].t} description={TITLES[secao].d} back={{ href: "/ajustes", label: "Ajustes" }} />
      <div className="space-y-10">
        {secao === "clinica" && (
        <Section id="clinica" title="Clínica">
          <Card className="p-5 sm:p-6">
            <ActionForm action={renameClinic}>
              <Field label="Nome da clínica" htmlFor="clinic-name">
                <Input id="clinic-name" name="name" defaultValue={ctx.clinicName} disabled={!admin} required />
              </Field>
              <Field
                label="Link para avaliar no Google (opcional)"
                hint="Quem der nota 9 ou 10 na pesquisa de satisfação é convidado a avaliar a clínica no Google. Pegue o link em Perfil da Empresa no Google → Pedir avaliações."
              >
                <Input name="review_url" type="url" inputMode="url" defaultValue={clinicRow?.review_url ?? ""} disabled={!admin} placeholder="https://g.page/r/..." />
              </Field>
              {admin && <SubmitButton size="md">Salvar</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>
        )}
        {secao === "equipe" && admin && (
          <Section id="equipe" title="Equipe e acessos">
            <Card className="divide-y divide-line overflow-hidden">
              {members.map((m) => (
                <div key={m.member_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={m.professional_name ?? m.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.professional_name ?? m.email}</p>
                    <p className="truncate text-sm text-muted">
                      {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL]} · {m.email}
                    </p>
                  </div>
                  {!m.active && <Badge>Sem acesso</Badge>}
                  {m.user_id !== ctx.userId && (
                    <form action={setMemberActive}>
                      <input type="hidden" name="id" value={m.member_id} />
                      <input type="hidden" name="active" value={String(!m.active)} />
                      <ConfirmSubmit
                        size="sm"
                        variant="ghost"
                        question={m.active ? `Tirar o acesso de ${m.email}? A pessoa não consegue mais entrar nesta clínica.` : `Devolver o acesso de ${m.email}?`}
                      >
                        {m.active ? "Tirar acesso" : "Devolver acesso"}
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              ))}
              {(invites ?? []).map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 bg-bg/50 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                    <UserPlus size={18} />
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-sm text-muted">Convite pendente · {ROLE_LABEL[i.role as keyof typeof ROLE_LABEL]}</p>
                  </div>
                  <div className="flex w-full justify-end gap-1 sm:w-auto">
                    <CopyButton text={`${origin}/convite/${i.token}`} />
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={i.id} />
                      <ConfirmSubmit size="sm" variant="ghost" question="Cancelar este convite?">
                        Cancelar
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              ))}
              <Disclosure
                summary={
                  <span className="flex items-center gap-3 font-medium text-accent">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-soft">
                      <UserPlus size={18} />
                    </span>
                    Convidar pessoa da equipe
                  </span>
                }
              >
                <ActionForm action={createInvite} resetOnSuccess>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="E-mail da pessoa">
                      <Input name="email" type="email" required placeholder="recepcao@clinica.com" />
                    </Field>
                    <Field label="O que ela vai fazer">
                      <Select name="role" defaultValue="recepcao">
                        <option value="recepcao">Recepção (agenda, pacientes, cobranças)</option>
                        <option value="profissional">Profissional (agenda própria e prontuário)</option>
                        <option value="financeiro">Financeiro (contas e comissões)</option>
                        <option value="admin">Administrador (tudo)</option>
                      </Select>
                    </Field>
                    <Field label="Se for profissional, qual é?" hint="Liga o login ao cadastro do profissional.">
                      <Select name="professional_id" defaultValue="">
                        <option value="">—</option>
                        {(pros ?? [])
                          .filter((p) => p.active && !p.member_id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  </div>
                  <SubmitButton size="md">Criar convite</SubmitButton>
                </ActionForm>
              </Disclosure>
            </Card>
            <p className="text-[13px] text-muted">O link do convite vale 14 dias. Envie pelo WhatsApp ou e-mail.</p>
          </Section>
        )}
        {secao === "profissionais" && (
        <Section
          id="profissionais"
          title="Profissionais"
          action={
            ctx.canSeeExpenses ? (
              <Link href="/equipe" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
                Comissões do mês e pagar →
              </Link>
            ) : undefined
          }
        >
          <Card className="divide-y divide-line overflow-hidden">
            {(pros ?? []).map((p) => (
              <Disclosure
                key={p.id}
                summary={
                  <>
                    <span className="relative">
                      <Avatar name={p.name} />
                      <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface" style={{ background: proColor(p.color, p.id) }} />
                    </span>
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
                      <ColorField value={p.color} />
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
                  <ColorField />
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
        )}
        {secao === "regras" && (
        <Section id="regras" title="Regras da agenda">
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
        )}
        {secao === "pix" && ctx.role !== "profissional" && (
          <section id="pix" className="scroll-mt-20 space-y-3">
            <h2 className="text-[17px] font-semibold">Recebimento por Pix</h2>
            <Card className="p-5 sm:p-6">
              <ActionForm action={savePix}>
                <p className="text-[15px] text-muted">
                  Com a chave cadastrada, cada cobrança sai com um <strong className="text-ink">Pix copia e cola com o valor certo</strong>, no WhatsApp e no
                  link do aluno. O dinheiro cai direto na conta da clínica.
                </p>
                <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                  <Field label="Tipo de chave">
                    <Select name="pix_key_type" defaultValue={rules?.pix_key_type ?? "cnpj"} disabled={!admin}>
                      {PIX_KEY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Chave Pix" hint="Deixe vazio para não usar Pix nas cobranças.">
                    <Input name="pix_key" defaultValue={rules?.pix_key ?? ""} disabled={!admin} placeholder="Ex.: 12.345.678/0001-90" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome de quem recebe" hint="Como aparece no banco (até 25 letras).">
                    <Input name="pix_name" maxLength={25} defaultValue={rules?.pix_name ?? ctx.clinicName.slice(0, 25)} disabled={!admin} />
                  </Field>
                  <Field label="Cidade">
                    <Input name="pix_city" maxLength={15} defaultValue={rules?.pix_city ?? ""} disabled={!admin} placeholder="Ex.: São Paulo" />
                  </Field>
                </div>
                {admin && <SubmitButton size="md">Salvar Pix</SubmitButton>}
              </ActionForm>
            </Card>
          </section>
        )}
        {secao === "apps" && ctx.role !== "profissional" && (
          <section id="apps" className="scroll-mt-20 space-y-3">
            <h2 className="text-[17px] font-semibold">Wellhub e TotalPass</h2>
            <Card className="p-5 sm:p-6">
              <ActionForm action={saveApps}>
                <p className="text-[15px] text-muted">
                  Ligue o app que sua clínica aceita. Na ficha do aluno, escolha <strong className="text-ink">&quot;Vem por&quot;</strong>: ele aparece
                  com um selo na agenda (para lembrar de validar o check-in no app) e cada presença entra na conta do que você tem a receber do
                  app, em Financeiro → Relatórios.
                </p>
                {(
                  [
                    { k: "wellhub", name: "Wellhub (antigo Gympass)", idLabel: "ID da academia no Wellhub" },
                    { k: "totalpass", name: "TotalPass", idLabel: "Código do estabelecimento no TotalPass" },
                  ] as const
                ).map(({ k, name, idLabel }) => {
                  const enabled = rules?.[`${k}_enabled`] ?? false;
                  const idVal = rules?.[k === "wellhub" ? "wellhub_gym_id" : "totalpass_id"] ?? "";
                  const cents = rules?.[`${k}_value_cents`];
                  return (
                    <fieldset key={k} className="space-y-3 rounded-xl border border-line p-4">
                      <label className="flex min-h-11 items-center gap-3">
                        <input type="checkbox" name={`${k}_enabled`} defaultChecked={enabled} disabled={!admin} className="size-5 accent-[var(--color-accent)]" />
                        <span className="font-medium">{name}</span>
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={idLabel} hint="Opcional por enquanto.">
                          <Input name={`${k}_id`} defaultValue={idVal} disabled={!admin} />
                        </Field>
                        <Field label="Quanto recebe por check-in (R$)" hint="Para estimar o repasse do mês.">
                          <Input name={`${k}_value`} inputMode="decimal" defaultValue={cents != null ? (cents / 100).toFixed(2).replace(".", ",") : ""} disabled={!admin} placeholder="18,50" />
                        </Field>
                      </div>
                    </fieldset>
                  );
                })}
                <p className="rounded-xl bg-hover px-4 py-3 text-sm text-muted">
                  A validação automática do check-in (o aluno faz check-in no app e a presença aparece sozinha no Durique) depende de o Durique ser
                  aprovado como parceiro de tecnologia do Wellhub e do TotalPass. Com o ID já cadastrado aqui, é só ligar quando sair.
                </p>
                {admin && <SubmitButton size="md">Salvar</SubmitButton>}
              </ActionForm>
            </Card>
          </section>
        )}
        {secao === "documentos" && (
        <Section id="documentos" title="Modelos de documentos">
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
        )}
        {secao === "conta" && (
        <Section id="conta" title="Sua conta">
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

        </Section>
        )}
      </div>
    </>
  );
}
