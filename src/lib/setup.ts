/** Assistente "Configurar clínica": passos e serviços sugeridos. */

export const SETUP_STEPS = [
  { n: 1, key: "tipo", title: "Como você trabalha", group: "Essencial", optional: false },
  { n: 2, key: "pacientes", title: "Seus pacientes", group: "Essencial", optional: true },
  { n: 3, key: "whatsapp", title: "WhatsApp", group: "Essencial", optional: true },
  { n: 4, key: "horarios", title: "Horários de atendimento", group: "Essencial", optional: false },
  { n: 5, key: "servicos", title: "Serviços e valores", group: "Essencial", optional: false },
  { n: 6, key: "perfil", title: "Dados da clínica", group: "Essencial", optional: false },
  { n: 7, key: "link", title: "Página da clínica", group: "Recomendado", optional: true },
  { n: 8, key: "equipe", title: "Sua equipe", group: "Recomendado", optional: true },
] as const;

export type PracticeType = "fisio" | "aulas" | "ambos";
export type Suggestion = { name: string; kind: "individual" | "turma"; duration: number };

/** Já vêm na lista conforme o tipo da clínica. */
export const DEFAULT_SERVICES: Record<"individual" | "turma", Suggestion[]> = {
  individual: [
    { name: "Avaliação", kind: "individual", duration: 60 },
    { name: "Sessão de fisioterapia", kind: "individual", duration: 50 },
  ],
  turma: [{ name: "Pilates em turma", kind: "turma", duration: 50 }],
};

/** Botões rápidos para acrescentar. */
export const EXTRA_SERVICES: Record<"individual" | "turma", Suggestion[]> = {
  individual: [
    { name: "Fisioterapia neurológica", kind: "individual", duration: 50 },
    { name: "Traumato-ortopédica", kind: "individual", duration: 50 },
    { name: "RPG", kind: "individual", duration: 50 },
    { name: "Osteopatia", kind: "individual", duration: 50 },
    { name: "Fisioterapia pélvica", kind: "individual", duration: 50 },
    { name: "Drenagem linfática", kind: "individual", duration: 60 },
    { name: "Pilates individual", kind: "individual", duration: 50 },
  ],
  turma: [
    { name: "Pilates em dupla", kind: "turma", duration: 50 },
    { name: "Funcional", kind: "turma", duration: 50 },
    { name: "Yoga", kind: "turma", duration: 60 },
    { name: "Alongamento", kind: "turma", duration: 50 },
    { name: "Pilates para gestantes", kind: "turma", duration: 50 },
  ],
};
