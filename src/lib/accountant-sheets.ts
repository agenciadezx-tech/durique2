/** Abas da Planilha do contador (usado na tela e na geração do arquivo). */
export const SHEETS = [
  { key: "entradas", label: "Entradas", text: "O que foi recebido: paciente, CPF, profissional e forma de pagamento" },
  { key: "saidas", label: "Saídas", text: "Despesas pagas no período, por categoria" },
  { key: "caixa", label: "Caixa diário", text: "Dia a dia com entradas, saídas e saldo acumulado" },
  { key: "competencia", label: "Faturamento (competência)", text: "O que venceu no período, pago ou não — o corte que o contador fecha" },
  { key: "receber", label: "A receber", text: "Cobranças do período ainda em aberto" },
  { key: "comissoes", label: "Comissões pagas", text: "Repasses aos profissionais (já incluídos nas saídas)" },
] as const;
export type SheetKey = (typeof SHEETS)[number]["key"];

