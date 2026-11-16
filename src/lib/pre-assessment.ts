/**
 * Pré-avaliação: perguntas que o paciente responde pelo celular antes de começar.
 * Cada clínica liga/desliga ("Pedir") e torna obrigatória ("Obrig.") cada pergunta,
 * separadamente para Consulta (individual) e Aula (turma). Pode ter até 10 perguntas próprias.
 */

export type FieldType = "text" | "textarea" | "date" | "scale" | "regions" | "choice" | "tel" | "email";
export type PreField = { key: string; label: string; type: FieldType; options?: string[]; placeholder?: string };
export type PreGroup = { key: string; title: string; fields: PreField[] };
export type FieldCfg = { ask: boolean; req: boolean };
export type PreConfig = { fields: Record<string, FieldCfg>; questions: { id: string; label: string; req: boolean }[] };

export const PRE_GROUPS: PreGroup[] = [
  {
    key: "dados",
    title: "Seus dados",
    fields: [
      { key: "cpf", label: "CPF", type: "text", placeholder: "000.000.000-00" },
      { key: "nascimento", label: "Data de nascimento", type: "date" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "estado_civil", label: "Estado civil", type: "choice", options: ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"] },
      { key: "profissao", label: "Profissão", type: "text" },
    ],
  },
  {
    key: "endereco",
    title: "Endereço",
    fields: [
      { key: "cep", label: "CEP", type: "text", placeholder: "00000-000" },
      { key: "endereco", label: "Rua e número", type: "text" },
      { key: "bairro", label: "Bairro", type: "text" },
      { key: "cidade", label: "Cidade", type: "text" },
    ],
  },
  {
    key: "dor",
    title: "Sua dor agora",
    fields: [
      { key: "queixa", label: "O que te trouxe aqui? (queixa principal)", type: "textarea" },
      { key: "dor_nivel", label: "Quanto dói agora? (0 a 10)", type: "scale" },
      { key: "dor_local", label: "Onde dói?", type: "regions" },
      { key: "dor_historico", label: "Desde quando? Como começou?", type: "textarea" },
    ],
  },
  {
    key: "saude",
    title: "Sua saúde",
    fields: [
      { key: "alergias", label: "Alergias", type: "text" },
      { key: "medicamentos", label: "Medicamentos em uso", type: "text" },
      { key: "cirurgias", label: "Cirurgias que já fez", type: "text" },
      { key: "doencas", label: "Doenças ou condições (pressão alta, diabetes…)", type: "text" },
      { key: "historico_familiar", label: "Histórico familiar relevante", type: "text" },
      { key: "gestante", label: "Está gestante?", type: "choice", options: ["Não", "Sim", "Não se aplica"] },
    ],
  },
  {
    key: "vida",
    title: "Estilo de vida",
    fields: [
      { key: "objetivo", label: "Qual o seu objetivo?", type: "textarea" },
      { key: "atividade", label: "Atividade física por semana", type: "choice", options: ["Nenhuma", "1 a 2 vezes", "3 a 4 vezes", "5 ou mais"] },
      { key: "habitos", label: "Hábitos (sono, trabalho sentado, fuma…)", type: "text" },
      { key: "como_conheceu", label: "Como conheceu a clínica?", type: "choice", options: ["Instagram", "Indicação", "Google", "Passei na frente", "Outro"] },
    ],
  },
  {
    key: "emergencia",
    title: "Contato de emergência",
    fields: [
      { key: "emerg_nome", label: "Nome", type: "text" },
      { key: "emerg_parentesco", label: "Parentesco", type: "text" },
      { key: "emerg_telefone", label: "Telefone", type: "tel" },
    ],
  },
];

export const ALL_FIELDS = PRE_GROUPS.flatMap((g) => g.fields);

/** Padrão: dados e endereço desligados; dor, saúde, vida e emergência ligados; queixa obrigatória. */
export function defaultConfig(kind: "consulta" | "aula"): PreConfig {
  const fields: Record<string, FieldCfg> = {};
  for (const g of PRE_GROUPS) {
    for (const f of g.fields) {
      const on = !["dados", "endereco"].includes(g.key);
      fields[f.key] = { ask: on && !(kind === "aula" && f.key === "dor_historico"), req: f.key === "queixa" || (kind === "aula" && f.key === "objetivo") };
    }
  }
  return { fields, questions: [] };
}

/** Junta o que está salvo com o padrão (campos novos entram com o padrão). */
export function mergeConfig(kind: "consulta" | "aula", saved?: Partial<PreConfig> | null): PreConfig {
  const base = defaultConfig(kind);
  if (!saved || !saved.fields || Object.keys(saved.fields).length === 0) return { ...base, questions: saved?.questions ?? [] };
  return { fields: { ...base.fields, ...saved.fields }, questions: saved.questions ?? [] };
}

export const KIND_LABEL = { consulta: "Consulta (individual)", aula: "Aula (turma, estúdio)" } as const;
