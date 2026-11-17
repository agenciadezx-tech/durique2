import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Settings, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, Badge, Card } from "@/components/ui";
import { AUTOMATIONS, automationState } from "@/lib/automations";
import { getContext } from "@/lib/context";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Configurações" };

type Item = { title: string; state: string; href?: string; show: boolean; soon?: boolean };

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const ctx = await getContext();
  const { salvo } = await searchParams;
  const admin = ctx.isAdmin;
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const today = new Date().toISOString();
  const [{ data: c }, { data: hours }, blocks, { data: rules }, { data: wa }, { data: autos }, { data: cats }, pros, docs, members, invites] = await Promise.all([
    supabase.from("clinics").select("name, brand_color, logo_url, booking_enabled, booking_slug, review_url, address").eq("id", ctx.clinicId).single(),
    supabase.from("clinic_hours").select("weekday, opens, closes").eq("clinic_id", ctx.clinicId).order("weekday"),
    supabase.from("time_blocks").select("id", head).eq("clinic_id", ctx.clinicId).is("professional_id", null).gte("starts_at", today),
    supabase.from("clinic_settings").select("cancel_notice_hours, makeup_validity_days, pix_key, wellhub_enabled, totalpass_enabled").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("whatsapp_settings").select("connected, tpl_lembrete, tpl_cobranca, tpl_renovacao").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("whatsapp_automations").select("key, enabled, template").eq("clinic_id", ctx.clinicId),
    ctx.canSeeExpenses ? supabase.from("categories").select("type").eq("clinic_id", ctx.clinicId).eq("active", true) : Promise.resolve({ data: [] as { type: string }[] }),
    supabase.from("professionals").select("id", head).eq("clinic_id", ctx.clinicId).eq("active", true),
    supabase.from("document_templates").select("id", head).eq("clinic_id", ctx.clinicId).eq("active", true),
    supabase.from("members").select("id", head).eq("clinic_id", ctx.clinicId).eq("active", true),
    admin ? supabase.from("invites").select("id", head).eq("clinic_id", ctx.clinicId).is("accepted_at", null).eq("revoked", false).gt("expires_at", today) : Promise.resolve({ count: 0 }),
  ]);
  const autoState = automationState(autos, wa);
  const autosOn = AUTOMATIONS.filter((a) => autoState[a.key].enabled).length;
  const hoursText = hours?.length
    ? `${hours.map((h) => WEEKDAYS_SHORT[h.weekday]).join(", ")} · ${hours[0].opens.slice(0, 5)}–${hours[0].closes.slice(0, 5)}`
    : "Ainda não definido";
  const nIn = (cats ?? []).filter((x) => x.type === "receita").length;
  const nOut = (cats ?? []).filter((x) => x.type === "despesa").length;

  const groups: { title: string; text: string; icon: LucideIcon; items: Item[] }[] = [
    {
      title: "Clínica",
      text: "Dados, identidade, horários e dias fechados",
      icon: MapPin,
      items: [
        { title: "Dados da clínica", state: [c?.name, c?.address].filter(Boolean).join(" · "), href: "/configurar?passo=6&so=1", show: admin },
        { title: "Identidade da clínica", state: `Logo, cor e textos · ${c?.logo_url ? "com logo" : "sem logo"}`, href: "/ajustes/identidade", show: admin },
        { title: "Horário de funcionamento", state: hoursText, href: "/configurar?passo=4&so=1", show: admin },
        { title: "Feriados e dias fechados", state: blocks.count ? `${blocks.count} dia(s) fechado(s) pela frente` : "Nenhum dia fechado", href: "/ajustes/feriados", show: ctx.canManageAgenda },
        { title: "Avaliação no Google", state: c?.review_url ? "Link configurado" : "Sem link", href: "/ajustes/clinica", show: admin },
      ],
    },
    {
      title: "Agenda",
      text: "Do agendamento até o paciente chegar",
      icon: CalendarDays,
      items: [
        { title: "Página da clínica", state: c?.booking_enabled ? `Ligada · /agendar/${c.booking_slug}` : "Desligada", href: "/ajustes/agendamento-online", show: admin },
        {
          title: "Regras de desmarcar e reposição",
          state: `${rules?.cancel_notice_hours ?? 12}h antes · reposição vale ${rules?.makeup_validity_days ?? 30} dias`,
          href: "/ajustes/regras",
          show: true,
        },
        { title: "Avisos do WhatsApp", state: `${autosOn} de ${AUTOMATIONS.length} ligados · ${wa?.connected ? "conectado" : "pela Central"}`, href: "/whatsapp/avisos", show: ctx.role !== "profissional" },
        { title: "Pré-avaliação", state: "Perguntas antes da primeira sessão", href: "/ajustes/pre-avaliacao", show: admin },
        { title: "Agenda no Google", state: "Ver os atendimentos no celular", href: "/ajustes/agenda-google", show: admin || !!ctx.professionalId },
      ],
    },
    {
      title: "Financeiro",
      text: "Recebimentos, categorias e parceiros",
      icon: Wallet,
      items: [
        { title: "Pix para receber", state: rules?.pix_key ? "Chave cadastrada" : "Sem chave Pix", href: "/ajustes/pix", show: admin },
        { title: "Categorias financeiras", state: `${nIn} de entrada · ${nOut} de saída`, href: "/financeiro/categorias", show: ctx.canSeeExpenses },
        {
          title: "Wellhub e TotalPass",
          state: [rules?.wellhub_enabled && "Wellhub", rules?.totalpass_enabled && "TotalPass"].filter(Boolean).join(" · ") || "Desligados",
          href: "/ajustes/apps",
          show: admin,
        },
        { title: "Notas fiscais e contador", state: "Planilha do mês e Carnê-Leão", href: "/financeiro/notas", show: ctx.canSeeExpenses },
        { title: "Recebimento automático e nota fiscal", state: "Pix e cartão com baixa sozinha, NFS-e", show: admin, soon: true },
      ],
    },
    {
      title: "Equipe e conta",
      text: "Pessoas, acessos, contratos e seus dados",
      icon: Users,
      items: [
        { title: "Equipe e acessos", state: `${members.count ?? 0} pessoa(s)${invites.count ? ` · ${invites.count} convite(s)` : ""}`, href: "/ajustes/equipe", show: admin },
        { title: "Profissionais e comissões", state: `${pros.count ?? 0} atendendo`, href: "/ajustes/profissionais", show: true },
        { title: "Contratos e termos", state: `${docs.count ?? 0} modelo(s)`, href: "/ajustes/documentos", show: ctx.role !== "financeiro" },
        { title: "Assistente de configuração", state: "Refazer o passo a passo inicial", href: "/configurar", show: admin },
        { title: "Sua conta e exportar dados", state: "Sair e baixar planilhas", href: "/ajustes/conta", show: true },
      ],
    },
  ];

  return (
    <div data-wide>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Configurações</h1>
          <p className="text-[15px] text-muted">Tudo que regula a clínica, separado por assunto.</p>
        </div>
        {!admin && (
          <Badge>
            <Settings size={13} /> Só o administrador altera a maior parte
          </Badge>
        )}
      </header>
      {salvo && (
        <div className="mb-4">
          <Alert tone="ok">Salvo.</Alert>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {groups.map((g) => {
          const items = g.items.filter((i) => i.show);
          if (!items.length) return null;
          return (
            <Card key={g.title} className="p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <g.icon size={21} />
              </span>
              <h2 className="mt-4 text-[18px] font-semibold">{g.title}</h2>
              <p className="text-sm text-muted">{g.text}</p>
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {items.map((i) => {
                  const inner = (
                    <>
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{i.title}</span>
                        <span className="block truncate text-[13px] text-muted">{i.state}</span>
                      </span>
                      {i.soon ? <Badge tone="warn">Em breve</Badge> : <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />}
                    </>
                  );
                  return (
                    <li key={i.title}>
                      {i.href ? (
                        <Link href={i.href} className="-mx-2 flex min-h-14 items-start gap-3 rounded-xl px-2 py-3 hover:bg-hover">
                          {inner}
                        </Link>
                      ) : (
                        <div className="-mx-2 flex min-h-14 items-start gap-3 px-2 py-3 opacity-80">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
