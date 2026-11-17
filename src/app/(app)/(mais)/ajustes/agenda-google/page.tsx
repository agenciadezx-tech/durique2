import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ConfirmSubmit } from "@/components/forms";
import { Avatar, buttonClass, Card, EmptyState, PageHeader, Section } from "@/components/ui";
import { getContext } from "@/lib/context";
import { proColor } from "@/lib/colors";
import { createClient } from "@/lib/supabase/server";
import { rotateCalendar } from "./actions";

export const metadata = { title: "Agenda no Google" };

export default async function GoogleCalendarPage() {
  const ctx = await getContext();
  if (!ctx.isAdmin && !ctx.professionalId) redirect("/ajustes");
  const supabase = await createClient();
  let q = supabase.from("professionals").select("id, name, color, calendar_token").eq("clinic_id", ctx.clinicId).eq("active", true).order("name");
  if (!ctx.isAdmin) q = q.eq("id", ctx.professionalId!);
  const { data: pros } = await q;
  const hh = await headers();
  const host = hh.get("host");
  const origin = `${hh.get("x-forwarded-proto") ?? "https"}://${host}`;

  return (
    <>
      <PageHeader
        title="Agenda no Google"
        description="Veja seus atendimentos do Durique no Google Agenda ou no calendário do iPhone, junto com seus compromissos pessoais."
        back={{ href: "/ajustes", label: "Configurações" }}
      />
      <div className="space-y-10">
        <Section title={ctx.isAdmin ? "Link de cada profissional" : "Seu link"}>
          {(pros ?? []).length === 0 ? (
            <EmptyState icon={<CalendarDays size={28} />} title="Nenhum profissional ativo" text="Cadastre os profissionais em Configurações." />
          ) : (
            <div className="space-y-3">
              {(pros ?? []).map((p) => {
                const url = `${origin}/cal/${p.calendar_token}.ics`;
                const webcal = `webcal://${host}/cal/${p.calendar_token}.ics`;
                const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
                return (
                  <Card key={p.id} className="p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <span className="size-3 rounded-full" style={{ background: proColor(p.color, p.id) }} />
                      <Avatar name={p.name} />
                      <span className="font-semibold">{p.name}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={google} target="_blank" rel="noreferrer" className={buttonClass("primary", "md")}>
                        Adicionar no Google Agenda
                      </a>
                      <a href={webcal} className={buttonClass("secondary", "md")}>
                        iPhone / Mac
                      </a>
                      <CopyButton text={url} label="Copiar link" />
                    </div>
                    <form action={rotateCalendar} className="mt-2">
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit
                        question="Gerar um link novo? O link antigo para de funcionar e será preciso adicionar de novo no Google."
                        variant="ghost"
                        size="sm"
                      >
                        Gerar link novo
                      </ConfirmSubmit>
                    </form>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Como funciona">
          <Card className="space-y-4 p-5 text-[15px] sm:p-6">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Toque em <strong>Adicionar no Google Agenda</strong> (use o computador ou o navegador do celular, entrando na sua conta Google) e confirme.
              </li>
              <li>
                Se não abrir: no Google Agenda do computador, vá em <strong>Outras agendas → + → Do URL</strong>, cole o link copiado e clique em
                Adicionar agenda.
              </li>
              <li>
                No iPhone: toque em <strong>iPhone / Mac</strong> e confirme &quot;Assinar&quot;.
              </li>
            </ol>
            <p className="rounded-xl bg-hover px-4 py-3 text-sm text-muted">
              É uma via só: o Google <strong>mostra</strong> a agenda do Durique, mas marcar ou desmarcar continua sendo feito aqui. O Google
              atualiza sozinho, em geral a cada poucas horas. Para proteger os pacientes, aparece só o primeiro nome. Não compartilhe o link; se
              vazar, gere um novo.
            </p>
          </Card>
        </Section>
      </div>
    </>
  );
}
