import type { AppContext } from "@/lib/context";

/** Itens do "Mais" agrupados por assunto e filtrados pelo papel de quem está logado. */
export type MaisItem = { href: string; icon: string; title: string; text: string };
export type MaisGroup = { title: string; items: MaisItem[] };

export function maisGroups(ctx: AppContext): MaisGroup[] {
  const finance = ctx.role !== "profissional";
  const groups: { title: string; items: (MaisItem & { show: boolean })[] }[] = [
    {
      title: "Dinheiro",
      items: [
        { href: "/financeiro", icon: "wallet", title: "Financeiro", text: "Quanto entrou, o que falta receber e as contas", show: finance },
        { href: "/financeiro/cobrancas", icon: "coins", title: "Cobranças", text: "Quem está devendo, cobrar e dar baixa", show: finance },
        { href: "/financeiro/comissoes", icon: "percent", title: "Comissões", text: "Quanto cada profissional tem a receber", show: ctx.canSeeExpenses },
        { href: "/financeiro/carne-leao", icon: "file", title: "Carnê-Leão", text: "Arquivo do mês para a Receita", show: ctx.canSeeExpenses },
      ],
    },
    {
      title: "Pacientes e divulgação",
      items: [
        { href: "/ajustes/agendamento-online", icon: "link", title: "Página da clínica", text: "Agendamento online e painel do paciente", show: ctx.isAdmin },
        { href: "/contatos", icon: "funnel", title: "Novos contatos", text: "Quem se interessou e em que passo está", show: ctx.canManageAgenda },
        { href: "/whatsapp/avisos", icon: "bell", title: "Avisos automáticos", text: "Mensagens de WhatsApp: lembrete, cobrança, aniversário", show: finance },
        { href: "/whatsapp", icon: "message", title: "Central do WhatsApp", text: "Mensagens prontas para mandar agora", show: finance },
        { href: "/ajustes/pre-avaliacao", icon: "clipboard", title: "Pré-avaliação", text: "Perguntas antes da primeira sessão", show: ctx.isAdmin },
        { href: "/ajustes/exercicios", icon: "dumbbell", title: "Exercícios para casa", text: "Biblioteca com vídeos para os pacientes", show: ctx.canSeeClinical },
      ],
    },
    {
      title: "A clínica",
      items: [
        { href: "/financeiro/saude", icon: "activity", title: "Saúde do negócio", text: "Metas do mês e o que fazer esta semana", show: ctx.canSeeExpenses },
        { href: "/atendimentos", icon: "check", title: "Atendimentos realizados", text: "Quantos no período, por profissional", show: finance },
        { href: "/financeiro/relatorios", icon: "chart", title: "Relatórios", text: "Sessões, faltas e satisfação por mês", show: ctx.canSeeExpenses },
        { href: "/ajustes/agenda-google", icon: "calendar", title: "Agenda no Google", text: "Ver os atendimentos no celular", show: ctx.isAdmin || !!ctx.professionalId },
        { href: "/ajustes", icon: "building", title: "Minha clínica", text: "Dados, equipe, regras, Pix e documentos", show: true },
      ],
    },
  ];
  return groups.map((g) => ({ title: g.title, items: g.items.filter((i) => i.show).map((i) => ({ href: i.href, icon: i.icon, title: i.title, text: i.text })) })).filter((g) => g.items.length);
}
