"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, buttonClass, Card, cx, Select } from "@/components/ui";
import { importPatients, type ImportResult, type ImportRow } from "../actions";

type Key = keyof ImportRow;
const TARGETS: { key: Key; label: string; aliases: string[] }[] = [
  { key: "name", label: "Nome", aliases: ["nome", "nome completo", "paciente", "aluno", "cliente", "name"] },
  { key: "phone", label: "WhatsApp / telefone", aliases: ["whatsapp", "telefone", "celular", "fone", "tel", "contato", "phone"] },
  { key: "email", label: "E-mail", aliases: ["email", "e-mail", "e mail"] },
  { key: "cpf", label: "CPF", aliases: ["cpf", "documento"] },
  { key: "birth_date", label: "Data de nascimento", aliases: ["nascimento", "data de nascimento", "data nascimento", "data nasc", "aniversario", "dt nasc"] },
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_.]/g, " ").trim();

function toISODate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 30 ? "19" : "20") + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

const TEMPLATE =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent("Nome;WhatsApp;E-mail;CPF;Data de nascimento\nMaria Silva;(11) 99999-8888;maria@email.com;123.456.789-09;15/03/1985\n");

export function Importer() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [map, setMap] = useState<Record<Key, number>>({ name: -1, phone: -1, email: -1, cpf: -1, birth_date: -1 });
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setError("");
    setResult(null);
    setFileName(file.name);
    try {
      let table: unknown[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(file)) as unknown as unknown[][];
      } else {
        const text = await file.text();
        table = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true }).data;
      }
      if (table.length < 2) throw new Error("A planilha precisa ter uma linha de títulos e pelo menos um paciente.");
      const hdr = table[0].map((h) => String(h ?? ""));
      const auto = { name: -1, phone: -1, email: -1, cpf: -1, birth_date: -1 } as Record<Key, number>;
      TARGETS.forEach((t) => {
        auto[t.key] = hdr.findIndex((h) => t.aliases.includes(norm(h)));
        if (auto[t.key] < 0) auto[t.key] = hdr.findIndex((h) => t.aliases.some((a) => norm(h).includes(a)));
      });
      setHeaders(hdr);
      setRows(table.slice(1).filter((r) => r.some((c) => String(c ?? "").trim())));
      setMap(auto);
    } catch (e) {
      setHeaders([]);
      setRows([]);
      setError(e instanceof Error && e.message.startsWith("A planilha") ? e.message : "Não consegui ler este arquivo. Envie um .xlsx ou .csv.");
    }
  }

  const parsed: ImportRow[] = useMemo(
    () =>
      rows.map((r) => {
        const get = (k: Key) => {
          const v = map[k] >= 0 ? r[map[k]] : undefined;
          return v == null || String(v).trim() === "" ? undefined : v;
        };
        // Excel costuma "comer" o zero à esquerda do CPF quando a coluna é numérica
        const cpfDigits = get("cpf") != null ? String(get("cpf")).replace(/\D/g, "") : "";
        return {
          name: String(get("name") ?? "").trim(),
          phone: get("phone") != null ? String(get("phone")) : undefined,
          email: get("email") != null ? String(get("email")) : undefined,
          cpf: cpfDigits ? cpfDigits.padStart(11, "0") : undefined,
          birth_date: toISODate(get("birth_date")),
        };
      }),
    [rows, map],
  );

  if (result) {
    return (
      <Card className="p-6 text-center sm:p-8">
        <CheckCircle2 size={40} className="mx-auto text-ok" />
        <h2 className="mt-3 text-xl font-semibold">
          {result.inserted} paciente{result.inserted === 1 ? "" : "s"} importado{result.inserted === 1 ? "" : "s"}
        </h2>
        {result.skipped.length > 0 && (
          <div className="mx-auto mt-5 max-w-md text-left">
            <p className="mb-2 text-sm font-medium">Atenção em {result.skipped.length} linha(s):</p>
            <ul className="max-h-48 space-y-1 overflow-auto rounded-xl bg-warn-soft p-3 text-sm text-warn">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  Linha {s.line} · {s.name}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/pacientes" className={cx(buttonClass("primary", "lg"), "mt-6")}>
          Ver pacientes
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}

      <Card className="p-5 sm:p-7">
        <ol className="mb-5 space-y-1 text-[15px] text-muted">
          <li>1. Abra sua planilha no Excel ou Google Planilhas.</li>
          <li>2. A primeira linha deve ter os títulos (Nome, WhatsApp, CPF…).</li>
          <li>3. Salve como .xlsx ou .csv e envie aqui.</li>
        </ol>
        <label
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent-soft/40",
          )}
        >
          <Upload size={28} className="text-accent" />
          <span className="mt-3 font-medium">{fileName || "Toque para escolher o arquivo"}</span>
          <span className="mt-1 text-sm text-muted">Excel (.xlsx) ou CSV</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        <a href={TEMPLATE} download="modelo-pacientes.csv" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
          <Download size={16} /> Baixar planilha modelo
        </a>
      </Card>

      {rows.length > 0 && (
        <>
          <Card className="p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold">
              <FileSpreadsheet size={20} className="text-accent" /> Confira as colunas
            </h2>
            <p className="mt-1 mb-5 text-[15px] text-muted">Já liguei automaticamente. Ajuste se algo estiver trocado.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {TARGETS.map((t) => (
                <label key={t.key} className="space-y-1.5">
                  <span className="block text-sm font-medium">
                    {t.label}
                    {t.key === "name" && <span className="text-bad"> *</span>}
                  </span>
                  <Select value={map[t.key]} onChange={(e) => setMap({ ...map, [t.key]: Number(e.target.value) })}>
                    <option value={-1}>— Não importar —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <p className="border-b border-line px-5 py-3 text-sm text-muted">
              Prévia · {rows.length} paciente{rows.length === 1 ? "" : "s"} encontrado{rows.length === 1 ? "" : "s"}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    {TARGETS.filter((t) => map[t.key] >= 0).map((t) => (
                      <th key={t.key} className="px-5 py-2 font-medium whitespace-nowrap">
                        {t.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {parsed.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {TARGETS.filter((t) => map[t.key] >= 0).map((t) => (
                        <td key={t.key} className="px-5 py-2.5 whitespace-nowrap">
                          {r[t.key] || <span className="text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <button
            type="button"
            disabled={map.name < 0 || pending}
            className={buttonClass("primary", "lg", true)}
            onClick={() =>
              start(async () => {
                const res = await importPatients(parsed);
                if (res.error) setError(res.error);
                else setResult(res);
              })
            }
          >
            {pending ? "Importando…" : `Importar ${rows.length} paciente${rows.length === 1 ? "" : "s"}`}
          </button>
          {map.name < 0 && <p className="text-center text-sm text-bad">Escolha qual coluna tem o nome.</p>}
        </>
      )}
    </div>
  );
}
