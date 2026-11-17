/**
 * Planilha do contador (.xlsx): o mês da clínica organizado em abas para mandar ao contador.
 * Gerada no servidor com exceljs a partir dos lançamentos (transactions).
 */
import type { Workbook, Worksheet } from "exceljs";
import { PAY_LABEL } from "@/lib/format";

import { SHEETS, type SheetKey } from "@/lib/accountant-sheets";
export { SHEETS, type SheetKey };

export type Tx = {
  type: "receita" | "despesa";
  description: string;
  amount_cents: number;
  due_date: string;
  paid_on: string | null;
  payment_method: string | null;
  categories: { name: string; system_key: string | null } | null;
  patients: { name: string; cpf: string | null; phone: string | null } | null;
  professionals: { name: string } | null;
};

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const brl = (c: number) => c / 100;
const cpf = (c: string | null | undefined) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : "");
const method = (m: string | null) => (m ? (PAY_LABEL[m] ?? m) : "Não informada");

function sheet(wb: Workbook, name: string, cols: { header: string; key: string; width: number; money?: boolean; date?: boolean }[], color: string): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : c.date ? { numFmt: "dd/mm/yyyy" } : {} }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color.replace("#", "")}` } };
  head.height = 22;
  head.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

function totalRow(ws: Worksheet, label: string, col: string, value: number) {
  const r = ws.addRow({});
  r.getCell(1).value = label;
  r.getCell(col).value = brl(value);
  r.font = { bold: true };
}

export async function buildAccountantWorkbook(opts: {
  clinic: string;
  from: string;
  to: string;
  professional: string | null;
  sheets: SheetKey[];
  txs: Tx[];
  today: string;
  color: string;
}): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Durique";
  const { from, to, txs } = opts;
  const inPaid = (t: Tx) => !!t.paid_on && t.paid_on >= from && t.paid_on <= to;
  const inDue = (t: Tx) => t.due_date >= from && t.due_date <= to;
  const entradas = txs.filter((t) => t.type === "receita" && inPaid(t)).sort((a, b) => a.paid_on!.localeCompare(b.paid_on!));
  const saidas = txs.filter((t) => t.type === "despesa" && inPaid(t)).sort((a, b) => a.paid_on!.localeCompare(b.paid_on!));
  const competencia = txs.filter((t) => t.type === "receita" && inDue(t)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const receber = competencia.filter((t) => !t.paid_on);
  const comissoes = saidas.filter((t) => t.categories?.system_key === "comissoes");
  const sum = (l: Tx[]) => l.reduce((n, t) => n + t.amount_cents, 0);
  const want = (k: SheetKey) => opts.sheets.includes(k);

  // Resumo (sempre)
  const rs = wb.addWorksheet("Resumo");
  rs.columns = [
    { key: "a", width: 34 },
    { key: "b", width: 22 },
  ];
  rs.addRow([opts.clinic]).font = { bold: true, size: 14 };
  rs.addRow([`Período: ${from.split("-").reverse().join("/")} a ${to.split("-").reverse().join("/")}`]);
  rs.addRow([`Profissional: ${opts.professional ?? "Todos — a clínica inteira"}`]);
  rs.addRow([]);
  const lines: [string, number][] = [
    ["Entradas (recebido no período)", sum(entradas)],
    ["Saídas (pago no período)", sum(saidas)],
    ["Resultado do caixa", sum(entradas) - sum(saidas)],
    ["Faturamento por competência", sum(competencia)],
    ["A receber do período", sum(receber)],
    ["Comissões pagas (dentro das saídas)", sum(comissoes)],
  ];
  for (const [l, v] of lines) {
    const r = rs.addRow([l, brl(v)]);
    r.getCell(2).numFmt = MONEY;
    if (l.startsWith("Resultado")) r.font = { bold: true };
  }
  rs.addRow([]);
  rs.addRow([`Gerado pelo Durique em ${opts.today.split("-").reverse().join("/")}`]).font = { italic: true, color: { argb: "FF6B6B66" } };

  if (want("entradas")) {
    const ws = sheet(
      wb,
      "Entradas",
      [
        { header: "Data", key: "d", width: 12, date: true },
        { header: "Paciente", key: "p", width: 30 },
        { header: "CPF", key: "c", width: 16 },
        { header: "Descrição", key: "ds", width: 36 },
        { header: "Categoria", key: "cat", width: 20 },
        { header: "Profissional", key: "pro", width: 20 },
        { header: "Forma", key: "f", width: 18 },
        { header: "Valor", key: "v", width: 14, money: true },
      ],
      opts.color,
    );
    for (const t of entradas)
      ws.addRow({ d: asDate(t.paid_on!), p: t.patients?.name ?? "", c: cpf(t.patients?.cpf), ds: t.description, cat: t.categories?.name ?? "", pro: t.professionals?.name ?? "", f: method(t.payment_method), v: brl(t.amount_cents) });
    totalRow(ws, "Total", "v", sum(entradas));
  }
  if (want("saidas")) {
    const ws = sheet(
      wb,
      "Saídas",
      [
        { header: "Data", key: "d", width: 12, date: true },
        { header: "Descrição", key: "ds", width: 38 },
        { header: "Categoria", key: "cat", width: 22 },
        { header: "Profissional", key: "pro", width: 20 },
        { header: "Forma", key: "f", width: 18 },
        { header: "Valor", key: "v", width: 14, money: true },
      ],
      opts.color,
    );
    for (const t of saidas) ws.addRow({ d: asDate(t.paid_on!), ds: t.description, cat: t.categories?.name ?? "", pro: t.professionals?.name ?? "", f: method(t.payment_method), v: brl(t.amount_cents) });
    totalRow(ws, "Total", "v", sum(saidas));
  }
  if (want("caixa")) {
    const ws = sheet(
      wb,
      "Caixa diário",
      [
        { header: "Data", key: "d", width: 12, date: true },
        { header: "Entradas", key: "e", width: 14, money: true },
        { header: "Saídas", key: "s", width: 14, money: true },
        { header: "Saldo do dia", key: "sd", width: 14, money: true },
        { header: "Acumulado no período", key: "ac", width: 20, money: true },
      ],
      opts.color,
    );
    const days = [...new Set([...entradas, ...saidas].map((t) => t.paid_on!))].sort();
    let acc = 0;
    for (const day of days) {
      const e = sum(entradas.filter((t) => t.paid_on === day));
      const s = sum(saidas.filter((t) => t.paid_on === day));
      acc += e - s;
      ws.addRow({ d: asDate(day), e: brl(e), s: brl(s), sd: brl(e - s), ac: brl(acc) });
    }
  }
  if (want("competencia")) {
    const ws = sheet(
      wb,
      "Competência",
      [
        { header: "Vencimento", key: "d", width: 12, date: true },
        { header: "Paciente", key: "p", width: 30 },
        { header: "CPF", key: "c", width: 16 },
        { header: "Descrição", key: "ds", width: 36 },
        { header: "Categoria", key: "cat", width: 20 },
        { header: "Situação", key: "st", width: 18 },
        { header: "Valor", key: "v", width: 14, money: true },
      ],
      opts.color,
    );
    for (const t of competencia)
      ws.addRow({
        d: asDate(t.due_date),
        p: t.patients?.name ?? "",
        c: cpf(t.patients?.cpf),
        ds: t.description,
        cat: t.categories?.name ?? "",
        st: t.paid_on ? `Pago em ${t.paid_on.split("-").reverse().join("/")}` : "Em aberto",
        v: brl(t.amount_cents),
      });
    totalRow(ws, "Total", "v", sum(competencia));
  }
  if (want("receber")) {
    const ws = sheet(
      wb,
      "A receber",
      [
        { header: "Vencimento", key: "d", width: 12, date: true },
        { header: "Paciente", key: "p", width: 30 },
        { header: "Telefone", key: "tel", width: 16 },
        { header: "Descrição", key: "ds", width: 36 },
        { header: "Dias em atraso", key: "at", width: 14 },
        { header: "Valor", key: "v", width: 14, money: true },
      ],
      opts.color,
    );
    for (const t of receber) {
      const late = Math.max(0, Math.round((asDate(opts.today).getTime() - asDate(t.due_date).getTime()) / 864e5));
      ws.addRow({ d: asDate(t.due_date), p: t.patients?.name ?? "", tel: t.patients?.phone ?? "", ds: t.description, at: late || "", v: brl(t.amount_cents) });
    }
    totalRow(ws, "Total", "v", sum(receber));
  }
  if (want("comissoes") && comissoes.length) {
    const ws = sheet(
      wb,
      "Comissões",
      [
        { header: "Data", key: "d", width: 12, date: true },
        { header: "Profissional", key: "pro", width: 24 },
        { header: "Descrição", key: "ds", width: 36 },
        { header: "Forma", key: "f", width: 18 },
        { header: "Valor", key: "v", width: 14, money: true },
      ],
      opts.color,
    );
    for (const t of comissoes) ws.addRow({ d: asDate(t.paid_on!), pro: t.professionals?.name ?? "", ds: t.description, f: method(t.payment_method), v: brl(t.amount_cents) });
    totalRow(ws, "Total", "v", sum(comissoes));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
