import { notFound, redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Section } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { proColor } from "@/lib/colors";
import { formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveProfessional, setMemberActive, toggleActive } from "../../ajustes/actions";
import { ColorField, CommissionFields } from "../../ajustes/product-fields";
import { RoleSelect } from "../role-select";
import { ServicePicker } from "./service-picker";

export const metadata = { title: "Membro da equipe" };

type Member = { member_id: string; user_id: string; email: string; role: keyof typeof ROLE_LABEL; active: boolean };

export default async function MembroPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/equipe");
  const { id } = await params;
  const supabase = await createClient();
  const members = (((await supabase.rpc("clinic_members", { p_clinic: ctx.clinicId })).data ?? []) as Member[]);

  // Login sem cadastro de profissional (recepção, financeiro…)
  if (id.startsWith("m-")) {
    const m = members.find((x) => x.member_id === id.slice(2));
    if (!m) notFound();
    return (
      <>
        <PageHeader title={m.email.split("@")[0]} description={m.email} back={{ href: "/equipe", label: "Equipe" }} />
        <MemberAccess m={m} me={ctx.userId} who={m.email} />
      </>
    );
  }

  const [{ data: p }, { data: services }, { data: mine }] = await Promise.all([
    supabase.from("professionals").select("*").eq("id", id).maybeSingle(),
    supabase.from("services").select("id, name, kind").eq("clinic_id", ctx.clinicId).eq("active", true).order("kind").order("name"),
    supabase.from("professional_services" as never).select("service_id").eq("professional_id", id),
  ]);
  if (!p) notFound();
  const m = p.member_id ? members.find((x) => x.member_id === p.member_id) : undefined;
  const chosen = ((mine ?? []) as { service_id: string }[]).map((r) => r.service_id);

  return (
    <>
      <PageHeader title={p.name} description={m ? `${ROLE_LABEL[m.role]} · ${m.email}` : "Sem login · aparece só na agenda"} back={{ href: "/equipe", label: "Equipe" }} />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: proColor(p.color, p.id) }} />
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[13px] font-semibold text-ok">
            <CalendarCheck size={14} /> Atende
          </span>
          {!p.active && <Badge>Inativo</Badge>}
        </div>

        <ActionForm action={saveProfessional} className="space-y-6">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="services_present" value="1" />
          <Card className="space-y-4 p-5">
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
              <Field label="CREFITO / registro" hint="Aparece nos registros do prontuário.">
                <Input name="crefito" defaultValue={p.crefito ?? ""} placeholder="Ex.: 123456-F" />
              </Field>
            </div>
          </Card>

          <Section title="Serviços que faz">
            <Card className="p-5">
              <ServicePicker services={services ?? []} chosen={chosen} />
            </Card>
          </Section>

          <Section title="Comissão e cor">
            <Card className="space-y-5 p-5">
              <CommissionFields percent={p.commission_percent} fixedCents={p.commission_fixed_cents} />
              <ColorField value={p.color} />
            </Card>
          </Section>

          <SubmitButton full>Salvar</SubmitButton>
        </ActionForm>

        {m && <MemberAccess m={m} me={ctx.userId} who={p.name} />}

        <form action={toggleActive} className="border-t border-line pt-5">
          <input type="hidden" name="table" value="professionals" />
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="active" value={String(!p.active)} />
          <ConfirmSubmit
            variant="ghost"
            className={p.active ? "text-bad!" : ""}
            question={p.active ? `Desativar ${p.name}? Sai da agenda e do link de agendamento; o histórico fica guardado.` : `Reativar ${p.name}?`}
          >
            {p.active ? "Desativar profissional" : "Reativar profissional"}
          </ConfirmSubmit>
        </form>
      </div>
    </>
  );
}

function MemberAccess({ m, me, who }: { m: Member; me: string; who: string }) {
  const self = m.user_id === me;
  return (
    <Section title="Acesso ao sistema">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Papel</p>
            <p className="text-sm text-muted">Define o que a pessoa vê.</p>
          </div>
          {self ? <Badge tone="info">Você · {ROLE_LABEL[m.role]}</Badge> : <RoleSelect memberId={m.member_id} role={m.role} who={who} />}
        </div>
        {!self && (
          <form action={setMemberActive} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <input type="hidden" name="id" value={m.member_id} />
            <input type="hidden" name="active" value={String(!m.active)} />
            <div>
              <p className="font-medium">{m.active ? "Pode entrar no sistema" : "Sem acesso"}</p>
              <p className="text-sm text-muted">{m.email}</p>
            </div>
            <ConfirmSubmit size="md" variant={m.active ? "ghost" : "secondary"} className={m.active ? "text-bad!" : ""} question={m.active ? `Tirar o acesso de ${who}?` : `Devolver o acesso de ${who}?`}>
              {m.active ? "Tirar acesso" : "Devolver acesso"}
            </ConfirmSubmit>
          </form>
        )}
      </Card>
    </Section>
  );
}
