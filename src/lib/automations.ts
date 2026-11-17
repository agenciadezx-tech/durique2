/**
 * Avisos automáticos do WhatsApp. Cada clínica liga/desliga e pode trocar o texto
 * (tabela whatsapp_automations). Enquanto o número não estiver conectado, os avisos marcados
 * com `central` aparecem prontos na Central do WhatsApp para enviar com um toque.
 * Os de lembrete, cobrança e renovação também gravam o texto em whatsapp_settings.tpl_*.
 */

export type AutoGroup = "agendamento" | "relacionamento" | "satisfacao" | "financeiro" | "documentos";

export type Automation = {
  key: string;
  group: AutoGroup;
  icon: "check" | "refresh" | "bell" | "clock" | "globe" | "list" | "users" | "cake" | "heart" | "moon" | "star" | "alert" | "coins" | "calendar" | "package" | "file" | "clipboard";
  title: string;
  text: string;
  when: string;
  team?: boolean; // vai para a equipe, não para o paciente
  central?: boolean; // já dá para mandar pela Central hoje
  settingsColumn?: "tpl_lembrete" | "tpl_cobranca" | "tpl_renovacao";
  vars: string[];
  template: string;
};

export const GROUPS: { key: AutoGroup; title: string; who: string }[] = [
  { key: "agendamento", title: "Agenda", who: "Pacientes com sessão ou aula marcada" },
  { key: "relacionamento", title: "Relacionamento", who: "Pacientes e alunos da clínica" },
  { key: "satisfacao", title: "Satisfação", who: "Quem já fez algumas sessões" },
  { key: "financeiro", title: "Pagamentos", who: "Quem tem parcela ou pacote" },
  { key: "documentos", title: "Documentos e avaliação", who: "Pacientes novos" },
];

export const VAR_LABEL: Record<string, string> = {
  nome: "primeiro nome",
  servico: "serviço",
  dia: "dia",
  hora: "horário",
  profissional: "profissional",
  clinica: "nome da clínica",
  link: "link do painel do paciente",
  descricao: "o que está sendo cobrado",
  valor: "valor",
  vencimento: "vencimento",
  restantes: "sessões restantes",
  pacote: "pacote",
  validade: "validade",
  paciente: "nome do paciente",
  nota: "nota dada",
  turma: "turma",
};

export const AUTOMATIONS: Automation[] = [
  // ===== Agenda =====
  {
    key: "confirmacao_imediata",
    group: "agendamento",
    icon: "check",
    title: "Agendamento feito",
    text: "Avisa o paciente assim que a sessão é marcada, com dia, hora e profissional.",
    when: "Na hora",
    vars: ["nome", "servico", "dia", "hora", "profissional", "clinica", "link"],
    template: "Oi, {nome}! Sua sessão de {servico} na {clinica} ficou marcada para {dia} às {hora}, com {profissional}. Qualquer mudança, é por aqui: {link}",
  },
  {
    key: "remarcacao",
    group: "agendamento",
    icon: "refresh",
    title: "Horário mudou",
    text: "Quando a sessão troca de dia ou hora, o paciente recebe o novo horário.",
    when: "Na hora",
    vars: ["nome", "servico", "dia", "hora", "clinica"],
    template: "Oi, {nome}! Sua sessão de {servico} mudou para {dia} às {hora}. Até lá! {clinica}",
  },
  {
    key: "lembrete_vespera",
    group: "agendamento",
    icon: "bell",
    title: "Lembrete da véspera",
    text: "Pede para confirmar a presença. Respondendo 1 confirma, 2 pede para remarcar.",
    when: "24h antes",
    central: true,
    settingsColumn: "tpl_lembrete",
    vars: ["nome", "servico", "dia", "hora", "profissional", "clinica", "link"],
    template:
      "Olá, {nome}! Lembrete da sua sessão de {servico} na {clinica}: {dia} às {hora}, com {profissional}. Responda 1 para confirmar ou 2 para remarcar.",
  },
  {
    key: "segundo_lembrete",
    group: "agendamento",
    icon: "clock",
    title: "Último lembrete",
    text: "Só para quem ainda não confirmou. Ajuda a evitar falta e horário vazio.",
    when: "2h antes",
    vars: ["nome", "servico", "hora", "clinica"],
    template: "{nome}, sua sessão de {servico} é hoje às {hora}. Ainda não recebemos sua confirmação: responda 1 se vem ou 2 se não puder vir. {clinica}",
  },
  {
    key: "novo_online",
    group: "agendamento",
    icon: "globe",
    title: "Marcaram pelo link",
    text: "Avisa a recepção quando alguém marca sozinho pela página da clínica.",
    when: "Na hora",
    team: true,
    vars: ["paciente", "servico", "dia", "hora"],
    template: "Novo agendamento pelo link: {paciente}, {servico}, {dia} às {hora}.",
  },
  {
    key: "vaga_fila",
    group: "agendamento",
    icon: "list",
    title: "Abriu vaga (lista de espera)",
    text: "Quem está na lista de espera fica sabendo que abriu vaga na turma ou no horário.",
    when: "Quando alguém desmarca",
    vars: ["nome", "servico", "dia", "hora", "link"],
    template: "Oi, {nome}! Abriu uma vaga em {servico}, {dia} às {hora}. Quer ficar com ela? Responda SIM ou entre pelo seu painel: {link}",
  },
  {
    key: "matricula",
    group: "agendamento",
    icon: "users",
    title: "Entrou na turma",
    text: "Boas-vindas ao aluno que passou a ter horário fixo.",
    when: "Na hora",
    vars: ["nome", "turma", "clinica", "link"],
    template: "Seja bem-vindo(a), {nome}! Seu horário fixo na {clinica} é {turma}. Pelo seu painel você confirma, desmarca e repõe aulas: {link}",
  },

  // ===== Relacionamento =====
  {
    key: "aniversario",
    group: "relacionamento",
    icon: "cake",
    title: "Aniversário",
    text: "Parabéns no dia do aniversário do paciente.",
    when: "No dia, de manhã",
    central: true,
    vars: ["nome", "clinica"],
    template: "Feliz aniversário, {nome}! 🎉 Toda a equipe da {clinica} deseja um ano cheio de saúde e movimento.",
  },
  {
    key: "pos_sessao",
    group: "relacionamento",
    icon: "heart",
    title: "Depois da primeira sessão",
    text: "Pergunta como o paciente se sentiu depois do primeiro atendimento.",
    when: "No dia seguinte",
    vars: ["nome", "clinica"],
    template: "Oi, {nome}! Como você está depois da sessão de ontem? Se sentir qualquer coisa diferente, conte pra gente. {clinica}",
  },
  {
    key: "sumiu",
    group: "relacionamento",
    icon: "moon",
    title: "Sentimos sua falta",
    text: "Para quem não aparece há 21 dias. Também marca o paciente como Em risco.",
    when: "21 dias sem vir",
    vars: ["nome", "clinica", "link"],
    template: "Oi, {nome}! Faz um tempinho que não te vemos na {clinica}. Está tudo bem? Quer marcar um horário? {link}",
  },
  {
    key: "reativacao",
    group: "relacionamento",
    icon: "users",
    title: "Volta ao tratamento",
    text: "Convite para quem parou há 6 meses. Quem responder entra em Novos contatos.",
    when: "180 dias sem vir",
    vars: ["nome", "clinica"],
    template: "Oi, {nome}! Aqui é da {clinica}. Faz alguns meses desde sua última sessão. Que tal uma reavaliação para ver como você está?",
  },

  // ===== Satisfação =====
  {
    key: "pesquisa",
    group: "satisfacao",
    icon: "star",
    title: "Pesquisa de satisfação",
    text: "Pede uma nota de 0 a 10 pelo painel. Quem dá 9 ou 10 é convidado a avaliar no Google.",
    when: "Depois da 3ª sessão",
    vars: ["nome", "clinica", "link"],
    template: "{nome}, sua opinião ajuda muito a {clinica}! De 0 a 10, quanto você nos recomendaria? Leva 10 segundos: {link}",
  },
  {
    key: "nota_baixa",
    group: "satisfacao",
    icon: "alert",
    title: "Nota baixa",
    text: "Avisa o administrador quando alguém dá nota de 0 a 6, para ligar e entender.",
    when: "Na hora",
    team: true,
    vars: ["paciente", "nota"],
    template: "Atenção: {paciente} deu nota {nota} na pesquisa de satisfação. Vale uma ligação hoje.",
  },

  // ===== Pagamentos =====
  {
    key: "antes_vencimento",
    group: "financeiro",
    icon: "calendar",
    title: "Vence em 3 dias",
    text: "Lembrete gentil antes do vencimento, com o Pix copia e cola.",
    when: "3 dias antes",
    vars: ["nome", "descricao", "valor", "vencimento", "clinica"],
    template: "Oi, {nome}! Só lembrando: {descricao} de {valor} vence em {vencimento}. O Pix está no seu painel. {clinica}",
  },
  {
    key: "cobranca",
    group: "financeiro",
    icon: "coins",
    title: "Cobrança",
    text: "No dia do vencimento ou para quem está atrasado. Vai com o Pix copia e cola.",
    when: "No vencimento",
    central: true,
    settingsColumn: "tpl_cobranca",
    vars: ["nome", "descricao", "valor", "vencimento", "clinica"],
    template:
      "Olá, {nome}! Tudo bem? Passando para lembrar do pagamento de {descricao}, no valor de {valor}, com vencimento em {vencimento}. Qualquer dúvida é só chamar. {clinica}",
  },
  {
    key: "renovacao",
    group: "financeiro",
    icon: "package",
    title: "Pacote acabando",
    text: "Quando restam 2 sessões ou o pacote vence em 7 dias.",
    when: "2 sessões antes do fim",
    central: true,
    settingsColumn: "tpl_renovacao",
    vars: ["nome", "restantes", "pacote", "validade", "clinica"],
    template: "Olá, {nome}! Restam {restantes} sessões do seu {pacote} na {clinica}. Quer já garantir a renovação para não interromper o tratamento?",
  },

  // ===== Documentos =====
  {
    key: "contrato",
    group: "documentos",
    icon: "file",
    title: "Assinar documento",
    text: "Envia o termo ou contrato para o paciente assinar pelo celular.",
    when: "Ao gerar o documento",
    central: true,
    vars: ["nome", "clinica", "link"],
    template: "Oi, {nome}! Para começar na {clinica}, falta só assinar este documento pelo celular: {link}",
  },
  {
    key: "pre_avaliacao",
    group: "documentos",
    icon: "clipboard",
    title: "Pré-avaliação",
    text: "Perguntas sobre dor e saúde para o paciente responder antes de chegar.",
    when: "Ao pedir na ficha",
    central: true,
    vars: ["nome", "clinica", "link"],
    template: "Olá, {nome}! Para adiantar seu atendimento na {clinica}, responda esta pré-avaliação (leva uns 3 minutos): {link}",
  },
];

export type AutoState = { enabled: boolean; template: string; custom: boolean };

/** Junta o padrão com o que a clínica salvou (e com os textos antigos de whatsapp_settings). */
export function automationState(
  rows: { key: string; enabled: boolean; template: string | null }[] | null,
  settings: Partial<Record<"tpl_lembrete" | "tpl_cobranca" | "tpl_renovacao", string>> | null,
): Record<string, AutoState> {
  const byKey = new Map((rows ?? []).map((r) => [r.key, r]));
  const out: Record<string, AutoState> = {};
  for (const a of AUTOMATIONS) {
    const r = byKey.get(a.key);
    const legacy = a.settingsColumn ? settings?.[a.settingsColumn] : undefined;
    const template = r?.template ?? legacy ?? a.template;
    out[a.key] = { enabled: r?.enabled ?? true, template, custom: template !== a.template };
  }
  return out;
}
