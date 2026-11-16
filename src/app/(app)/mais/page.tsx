import Link from "next/link";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Download,
  Dumbbell,
  FileText,
  HandCoins,
  LogOut,
  MessageCircle,
  Percent,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";

export const metadata = { title: "Mais" };

type Item = { href: string; icon: LucideIcon; title: string; text: string; show: boolean };

export default async function MaisPage() {
  const ctx = await getContext();
  const finance = ctx.role !== "profissional";
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Dinheiro",
      items: [
        { href: "/financeiro", icon: Wallet, title: "Financeiro", text: "Quanto entrou, o que falta receber e as contas", show: finance },
        { href: "/financeiro/cobrancas", icon: HandCoins, title: "Cobranças", text: "Quem está devendo, cobrar e dar baixa", show: finance },
        { href: "/financeiro/lancamentos", icon: Receipt, title: "Lançamentos", text: "Todas as entradas e saídas", show: finance },
        { href: "/financeiro/comissoes", icon: Percent, title: "Comissões", text: "Quanto cada profissional tem a receber", show: ctx.canSeeExpenses },
        { href: "/financeiro/relatorios", icon: BarChart3, title: "Relatórios", text: "Sessões, faltas, satisfação e receita por mês", show: ctx.canSeeExpenses },
        { href: "/financeiro/carne-leao", icon: FileText, title: "Carnê-Leão", text: "Arquivo do mês para a Receita", show: ctx.canSeeExpenses },
      ],
    },
    {
      title: "Pacientes e divulgação",
      items: [
        { href: "/whatsapp", icon: MessageCircle, title: "WhatsApp", text: "Lembretes, renovações e mensagens prontas", show: finance },
        { href: "/ajustes/agendamento-online", icon: CalendarPlus, title: "Agendamento online", text: "Link para o paciente marcar sozinho", show: ctx.isAdmin },
        { href: "/ajustes/exercicios", icon: Dumbbell, title: "Exercícios para casa", text: "Biblioteca com vídeos para passar aos pacientes", show: ctx.canSeeClinical },
      ],
    },
    {
      title: "Sua clínica",
      items: [
        { href: "/ajustes", icon: Building2, title: "Minha clínica", text: "Dados, equipe, profissionais, regras, Pix e documentos", show: true },
        { href: "/ajustes/agenda-google", icon: CalendarDays, title: "Agenda no Google", text: "Ver os atendimentos no Google Agenda ou iPhone", show: ctx.isAdmin || !!ctx.professionalId },
        { href: "/ajustes#equipe", icon: Users, title: "Equipe e acessos", text: "Convidar pessoas e definir o que cada uma vê", show: ctx.isAdmin },
        { href: "/ajustes#conta", icon: Download, title: "Exportar dados", text: "Planilhas de pacientes, sessões e financeiro", show: ctx.isAdmin },
      ],
    },
  ];

  return (
    <>
      <PageHeader title="Mais" description="Dinheiro, divulgação e tudo da sua clínica." />
      <div className="space-y-8">
        {groups.map((g) => {
          const items = g.items.filter((i) => i.show);
          if (!items.length) return null;
          return (
            <section key={g.title}>
              <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{g.title}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map(({ href, icon: Icon, title, text }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-hover">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <Icon size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{title}</span>
                      <span className="block text-sm text-muted">{text}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-faint" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <form action="/auth/sair" method="post" className="rounded-2xl border border-line bg-surface p-4 lg:hidden">
          <p className="truncate text-sm font-medium">{ctx.email}</p>
          <p className="text-sm text-muted">{ROLE_LABEL[ctx.role]} · {ctx.clinicName}</p>
          <button className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-ink">
            <LogOut size={18} /> Sair
          </button>
        </form>
      </div>
    </>
  );
}
