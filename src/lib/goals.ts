/** Metas da clínica (tabela clinic_goals). Sem meta salva, usa o padrão. */
export type GoalKey = "ocupacao_consultas" | "ocupacao_aulas" | "ticket_pacote" | "ticket_mensal" | "novos_contatos" | "faltas_max" | "nps";

export const GOALS: { key: GoalKey; label: string; unit: "pct" | "money" | "num"; def: number; hint: string }[] = [
  { key: "ocupacao_consultas", label: "Agenda de consultas ocupada", unit: "pct", def: 70, hint: "% dos horários de atendimento preenchidos" },
  { key: "ocupacao_aulas", label: "Vagas das turmas ocupadas", unit: "pct", def: 75, hint: "% das vagas com aluno" },
  { key: "ticket_pacote", label: "Valor médio do pacote", unit: "money", def: 0, hint: "Quanto vale, em média, cada pacote vendido" },
  { key: "ticket_mensal", label: "Valor médio do plano mensal", unit: "money", def: 0, hint: "Mensalidade média dos alunos" },
  { key: "novos_contatos", label: "Novos contatos no mês", unit: "num", def: 20, hint: "Pessoas interessadas que chegaram" },
  { key: "faltas_max", label: "Faltas no máximo", unit: "pct", def: 10, hint: "% das sessões em que o paciente faltou" },
  { key: "nps", label: "Nota de satisfação (NPS)", unit: "num", def: 70, hint: "De −100 a 100" },
];

/** valores em centavos para "money"; demais em número simples */
export function goalMap(rows: { key: string; target: number | string }[] | null): Record<GoalKey, number> {
  const out = Object.fromEntries(GOALS.map((g) => [g.key, g.def])) as Record<GoalKey, number>;
  for (const r of rows ?? []) if (r.key in out) out[r.key as GoalKey] = Number(r.target);
  return out;
}
