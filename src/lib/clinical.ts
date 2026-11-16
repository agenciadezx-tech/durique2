// Prontuário fisioterapêutico: campos (Res. COFFITO 414/2012), regiões do mapa de dor e escalas

export const ASSESSMENT_FIELDS = [
  { key: "queixa_principal", label: "Queixa principal", hint: "O que trouxe o paciente, nas palavras dele.", rows: 2 },
  { key: "historia_doenca", label: "História da doença atual", hint: "Quando começou, como evoluiu, o que piora e o que melhora.", rows: 3 },
  { key: "antecedentes", label: "Antecedentes e hábitos", hint: "Doenças, cirurgias, atividade física, trabalho.", rows: 2 },
  { key: "medicamentos", label: "Medicamentos em uso", hint: "", rows: 1 },
  { key: "exame_fisico", label: "Exame físico e funcional", hint: "Inspeção, palpação, amplitude de movimento, força, testes especiais.", rows: 4 },
  { key: "exames_complementares", label: "Exames complementares", hint: "Imagem, laudos e outros exames apresentados.", rows: 2 },
  { key: "diagnostico", label: "Diagnóstico fisioterapêutico", hint: "", rows: 2 },
  { key: "prognostico", label: "Prognóstico", hint: "", rows: 1 },
  { key: "objetivos", label: "Objetivos do tratamento", hint: "", rows: 2 },
  { key: "plano_terapeutico", label: "Plano terapêutico", hint: "Condutas, frequência e número de sessões previstos.", rows: 3 },
] as const;

export const EVOLUTION_FIELDS = [
  { key: "subjetivo", label: "Como o paciente chegou", hint: "Relato do paciente desde a última sessão.", rows: 2 },
  { key: "conduta", label: "O que foi feito", hint: "Técnicas, exercícios, aparelhos, cargas.", rows: 3 },
  { key: "resposta", label: "Resposta ao tratamento", hint: "Como reagiu, o que mudou.", rows: 2 },
  { key: "intercorrencias", label: "Intercorrências", hint: "Se houve algo fora do esperado.", rows: 1 },
] as const;

export const PAIN_REGIONS = [
  "Cabeça",
  "Cervical",
  "Ombro direito",
  "Ombro esquerdo",
  "Cotovelo direito",
  "Cotovelo esquerdo",
  "Punho/mão direita",
  "Punho/mão esquerda",
  "Torácica",
  "Lombar",
  "Quadril direito",
  "Quadril esquerdo",
  "Joelho direito",
  "Joelho esquerdo",
  "Tornozelo/pé direito",
  "Tornozelo/pé esquerdo",
] as const;

/** Escalas comuns na fisio (resultado digitado; o questionário é aplicado à parte). */
export const SCALES = [
  { key: "eva", label: "EVA de dor", max: 10, better: "lower", unit: "", help: "0 = sem dor · 10 = pior dor possível" },
  { key: "oswestry", label: "Oswestry (ODI) – lombar", max: 100, better: "lower", unit: "%", help: "% de incapacidade" },
  { key: "roland_morris", label: "Roland-Morris – lombar", max: 24, better: "lower", unit: "", help: "0 a 24 pontos" },
  { key: "ndi", label: "NDI – cervical", max: 100, better: "lower", unit: "%", help: "% de incapacidade" },
  { key: "dash", label: "QuickDASH – membro superior", max: 100, better: "lower", unit: "", help: "0 a 100" },
  { key: "spadi", label: "SPADI – ombro", max: 100, better: "lower", unit: "%", help: "% de incapacidade" },
  { key: "lysholm", label: "Lysholm – joelho", max: 100, better: "higher", unit: "", help: "0 a 100 (maior = melhor)" },
  { key: "lefs", label: "LEFS – membro inferior", max: 80, better: "higher", unit: "", help: "0 a 80 (maior = melhor)" },
  { key: "psfs", label: "PSFS – escala funcional", max: 10, better: "higher", unit: "", help: "média 0 a 10 (maior = melhor)" },
  { key: "outra", label: "Outra", max: null, better: "lower", unit: "", help: "" },
] as const;

export const SCALE_LABEL: Record<string, string> = Object.fromEntries(SCALES.map((s) => [s.key, s.label]));

export function painColor(v: number | null | undefined): string {
  if (v == null) return "bg-hover text-muted";
  if (v <= 3) return "bg-ok-soft text-ok";
  if (v <= 6) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}

/** IMC a partir de peso (kg) e altura (cm). */
export function bmi(peso?: number | null, altura?: number | null): number | null {
  if (!peso || !altura) return null;
  const m = altura / 100;
  return peso / (m * m);
}

export function bmiLabel(v: number | null) {
  if (v == null) return "";
  if (v < 18.5) return "abaixo do peso";
  if (v < 25) return "peso adequado";
  if (v < 30) return "sobrepeso";
  return "obesidade";
}
