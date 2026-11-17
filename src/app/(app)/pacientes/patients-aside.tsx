"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Cake, FileSpreadsheet, Plus, Search } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";

export type AsidePatient = {
  id: string;
  name: string;
  phone: string | null;
  summary: string | null;
  birth: string | null; // "MM-DD"
  active: boolean;
  kinds: ("consulta" | "aula")[];
};

const initials = (n: string) => {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lista de pacientes fixa à esquerda (computador): busca na hora, abas e atalhos. */
export function PatientsAside({ patients, month, canAdd }: { patients: AsidePatient[]; month: string; canAdd: boolean }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"todos" | "consulta" | "aula" | "arquivados">("todos");
  const [chip, setChip] = useState<"" | "aniversario" | "sem">("");
  const activeId = path.match(/^\/pacientes\/([0-9a-f-]{36})/)?.[1];

  const list = useMemo(() => {
    const t = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    return patients.filter((p) => {
      if (tab === "arquivados" ? p.active : !p.active) return false;
      if (tab === "consulta" && !p.kinds.includes("consulta")) return false;
      if (tab === "aula" && !p.kinds.includes("aula")) return false;
      if (chip === "aniversario" && p.birth?.slice(0, 2) !== month) return false;
      if (chip === "sem" && p.kinds.length > 0) return false;
      if (!t) return true;
      return norm(p.name).includes(t) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits));
    });
  }, [patients, q, tab, chip, month]);

  const activeCount = patients.filter((p) => p.active).length;
  const birthdays = patients.filter((p) => p.active && p.birth?.slice(0, 2) === month).length;
  const noSession = patients.filter((p) => p.active && p.kinds.length === 0).length;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-7 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight">
            Pacientes <span className="text-base font-normal text-muted">{activeCount}</span>
          </h1>
          {canAdd && (
            <Link href="/pacientes/novo" className={buttonClass("primary", "sm")}>
              <Plus size={16} /> Novo
            </Link>
          )}
        </div>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome ou telefone…"
            aria-label="Buscar paciente"
            className="h-11 w-full rounded-xl border border-line bg-bg pr-3 pl-9 text-[16px] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-hover p-1 text-[13px]" role="tablist">
          {(
            [
              { k: "todos", l: "Todos", dot: "" },
              { k: "consulta", l: "Consultas", dot: "bg-chart-in" },
              { k: "aula", l: "Aulas", dot: "bg-chart-out" },
              { k: "arquivados", l: "Arquiv.", dot: "" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              role="tab"
              aria-selected={tab === o.k}
              onClick={() => setTab(o.k)}
              className={cx("flex h-9 items-center justify-center gap-1 rounded-lg font-medium", tab === o.k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {o.dot && <span className={cx("size-1.5 rounded-full", o.dot)} />}
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={chip === "aniversario"}
            onClick={() => setChip(chip === "aniversario" ? "" : "aniversario")}
            className={cx("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-medium", chip === "aniversario" ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}
          >
            <Cake size={14} /> Aniversariantes do mês {birthdays > 0 && <span className="tabular-nums">{birthdays}</span>}
          </button>
          <button
            type="button"
            aria-pressed={chip === "sem"}
            onClick={() => setChip(chip === "sem" ? "" : "sem")}
            className={cx("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-medium", chip === "sem" ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}
          >
            Sem sessão {noSession > 0 && <span className="tabular-nums">{noSession}</span>}
          </button>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Ninguém encontrado.</li>}
        {list.map((p) => {
          const on = p.id === activeId;
          return (
            <li key={p.id}>
              <Link href={`/pacientes/${p.id}`} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-3 rounded-xl px-2.5 py-2.5", on ? "bg-accent-soft" : "hover:bg-hover")}>
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold", on ? "bg-accent text-white" : "bg-hover text-muted")}>{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-[13px] text-muted">{p.summary || p.phone || "Sem telefone"}</span>
                </span>
                {p.kinds.length > 0 && (
                  <span
                    className={cx(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                      p.kinds.includes("aula") && !p.kinds.includes("consulta") ? "bg-chart-out/15 text-[#a85a17]" : "bg-chart-in/15 text-accent",
                    )}
                  >
                    {p.kinds.length > 1 ? "Ambos" : p.kinds[0] === "aula" ? "Aulas" : "Consultas"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {canAdd && (
        <Link href="/pacientes/importar" className="flex min-h-12 items-center justify-center gap-2 border-t border-line text-sm font-medium text-muted hover:text-ink">
          <FileSpreadsheet size={16} /> Importar planilha
        </Link>
      )}
    </div>
  );
}
