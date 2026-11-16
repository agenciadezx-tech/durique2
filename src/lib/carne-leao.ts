/**
 * Arquivo de importação do Carnê-Leão Web (Receita Federal) — rendimentos do trabalho não assalariado
 * recebidos de pessoa física (modelo oficial "Modelo de arquivo para rendimentos do Trabalho não Assalariado").
 *
 * Uma linha por recebimento, campos separados por ";", sem cabeçalho:
 *  1 data (dd/mm/aaaa) · 2 código R01.001.001 · 3 código de ocupação · 4 valor (9999,99) · 5 dedução (vazio)
 *  6 histórico · 7 PF · 8 CPF do titular do pagamento · 9 CPF do beneficiário do serviço
 * Máximo de 1.000 linhas por arquivo.
 */

export type CarneLeaoInput = {
  paid_on: string; // yyyy-mm-dd
  amount_cents: number;
  description: string;
  patient_name: string;
  patient_cpf: string | null;
};

export const CARNE_LEAO_MAX_LINES = 1000;

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Histórico sem ";", quebras de linha ou caracteres fora do Latin-1 (o arquivo vai em ISO-8859-1). */
const history = (s: string) =>
  s
    .replace(/[;\r\n"]/g, " ")
    .replace(/[^ -~ -ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

export function buildCarneLeao(rows: CarneLeaoInput[], ocupacao: string) {
  const ok = rows.filter((r) => r.patient_cpf && /^\d{11}$/.test(r.patient_cpf) && r.amount_cents > 0);
  const missing = rows.filter((r) => !(r.patient_cpf && /^\d{11}$/.test(r.patient_cpf)));
  const lines = ok.map((r) =>
    [
      ddmmyyyy(r.paid_on),
      "R01.001.001",
      ocupacao,
      (r.amount_cents / 100).toFixed(2).replace(".", ","),
      "",
      history(`${r.description} - ${r.patient_name}`),
      "PF",
      r.patient_cpf,
      r.patient_cpf,
    ].join(";"),
  );
  return { lines, included: ok, missing };
}
