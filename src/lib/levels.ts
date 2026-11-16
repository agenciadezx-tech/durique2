/** Nível do aluno/paciente usado na evolução da aula (1 a 5). */
export const LEVELS = [
  { value: 1, label: "Iniciante" },
  { value: 2, label: "Básico" },
  { value: 3, label: "Intermediário" },
  { value: 4, label: "Avançado" },
  { value: 5, label: "Muito avançado" },
] as const;

export const levelLabel = (n: number | null | undefined) => LEVELS.find((l) => l.value === n)?.label ?? "";
