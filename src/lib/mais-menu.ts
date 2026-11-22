import type { AppContext } from "@/lib/context";

/** Itens do "Mais" agrupados por assunto e filtrados pelo papel de quem está logado. */
export type MaisItem = { href: string; icon: string; title: string; text: string; mobileOnly?: boolean };
export type MaisTone = "violet" | "green" | "sky" | "amber";
export type MaisGroup = { title: string; tone: MaisTone; items: MaisItem[] };

export function maisGroups(ctx: AppContext): MaisGroup[] {
  const finance = ctx.role !== "profissional";
  const groups: { title: string; tone: MaisTone; items: (MaisItem & { show: boolean })[] }[] = [
    {
      title: "Resultados",
      tone: "violet",
      items: [
        { href: "/financeiro/relatorios", icon: "pie", title: "Relatórios", text: "Gráficos de sessões, faltas, receita e satisfação", show: ctx.canSeeExpenses },
        { href: "/financeiro/saude", icon: "target", title: "Saúde do negócio", text: "Metas do mês e o que fazer esta semana", show: ctx.canSeeExpenses },
      ],
    },
    {
      title: "Dinheiro",
      tone: "green",
      items: [
        { href: "/financeiro", icon: "wallet", title: "Financeiro", text: "Quanto entrou, o que falta receber e as contas", show: finance },
        { href: "/financeiro/cobrancas", icon: "coins", title: "A receber", text: "Quem está devendo: cobrar, Pix e dar baixa", show: finance },
        { href: "/equipe", icon: "users", title: "Equipe", text: "Quem trabalha, o que cada um vê e comissões", show: ctx.isAdmin || ctx.canSeeExpenses },
        { href: "/financeiro/notas", icon: "receipt", title: "Notas fiscais", text: "Planilha do contador e Carnê-Leão", show: ctx.canSeeExpenses },
      ],
    },
    {
      title: "Pacientes e divulgação",
      tone: "sky",
      items: [
        { href: "/ajustes/agendamento-online", icon: "globe", title: "Link de agendamento", text: "Página da clínica e app do paciente", show: ctx.isAdmin },
        { href: "/contatos", icon: "magnet", title: "Interessados", text: "Quem pediu informação e em que passo está", show: ctx.canManageAgenda },
        { href: "/whatsapp/avisos", icon: "bell", title: "Mensagens automáticas", text: "Lembrete, cobrança, aniversário pelo WhatsApp", show: finance },
        { href: "/whatsapp", icon: "message", title: "Enviar no WhatsApp", text: "Mensagens prontas para mandar agora", show: finance },
        { href: "/ajustes/pre-avaliacao", icon: "clipboard", title: "Pré-avaliação", text: "Perguntas antes da primeira sessão", show: ctx.isAdmin },
        { href: "/ajustes/exercicios", icon: "play", title: "Exercícios para casa", text: "Biblioteca com vídeos para os pacientes", show: ctx.canSeeClinical },
      ],
    },
    {
      title: "A clínica",
      tone: "amber",
      items: [
        { href: "/catalogo", icon: "layers", title: "Serviços e preços", text: "O que a clínica vende: preços, planos e turmas", show: true, mobileOnly: true },
        { href: "/atendimentos", icon: "check", title: "Atendimentos realizados", text: "Quantos no período, por profissional", show: finance },
        { href: "/ajustes/agenda-google", icon: "calendar", title: "Agenda no Google", text: "Ver os atendimentos no celular", show: ctx.isAdmin || !!ctx.professionalId },
        { href: "/ajustes", icon: "settings", title: "Ajustes", text: "Clínica, cores, agenda, financeiro e conta", show: true },
      ],
    },
  ];
  return groups.map((g) => ({ title: g.title, tone: g.tone, items: g.items.filter((i) => i.show).map((i) => ({ href: i.href, icon: i.icon, title: i.title, text: i.text, mobileOnly: i.mobileOnly })) })).filter((g) => g.items.length);
}
