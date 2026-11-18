"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cake, FileSpreadsheet, Plus, Search } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";

export type AsidePatient = {
  id: string;
  name: string;
  phone: string | null;
  summary: string | null;
  birth: string | null; // "MM-DD"
  active: boolean;
  kinds: ("consulta" | "aula")[];
  tags: { n: string; k: "consulta" | "aula" }[];
  risk?: boolean;
};

const initials = (n: string) => {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RECENT_KEY = "durique:pacientes-recentes";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Lista de pacientes: no computador fica fixa à esquerda (variant "aside"); no celular é a tela /pacientes (variant "page").
 * Busca na hora, abas, atalhos (aniversariantes, sem sessão, em risco) e "Recentes" (os últimos abertos neste aparelho).
 */
export function PatientsAside({ patients, month, canAdd, variant = "aside" }: { patients: AsidePatient[]; month: string; canAdd: boolean; variant?: "aside" | "page" }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"todos" | "consulta" | "aula" | "arquivados">("todos");
  const [chip, setChip] = useState<"" | "aniversario" | "sem" | "risco">("");
  const [recent, setRecent] = useState<string[]>([]);
  const activeId = path.match(/^\/pacientes\/([0-9a-f-]{36})/)?.[1];
  const page = variant === "page";

  // guarda os últimos abertos (só neste aparelho)
  useEffect(() => {
    const r = readRecent();
    const next = activeId ? [activeId, ...r.filter((x) => x !== activeId)].slice(0, 6) : r;
    if (activeId) {
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* sem armazenamento */
      }
    }
    setRecent(next);
  }, [activeId]);

  const list = useMemo(() => {
    const t = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    return patients.filter((p) => {
      if (tab === "arquivados" ? p.active : !p.active) return false;
      if (tab === "consulta" && !p.kinds.includes("consulta")) return false;
      if (tab === "aula" && !p.kinds.includes("aula")) return false;
      if (chip === "aniversario" && p.birth?.slice(0, 2) !== month) return false;
      if (chip === "sem" && p.kinds.length > 0) return false;
      if (chip === "risco" && !p.risk) return false;
      if (!t) return true;
      return norm(p.name).includes(t) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) || norm(p.summary ?? "").includes(t);
    });
  }, [patients, q, tab, chip, month]);

  const plain = !q.trim() && tab === "todos" && !chip;
  const recentList = plain ? recent.map((id) => patients.find((p) => p.id === id && p.active)).filter((p): p is AsidePatient => !!p).slice(0, page ? 4 : 3) : [];
  const recentIds = new Set(recentList.map((p) => p.id));
  const rest = list.filter((p) => !recentIds.has(p.id));

  const activeCount = patients.filter((p) => p.active).length;
  const birthdays = patients.filter((p) => p.active && p.birth?.slice(0, 2) === month).length;
  const noSession = patients.filter((p) => p.active && p.kinds.length === 0).length;
  const atRisk = patients.filter((p) => p.active && p.risk).length;

  const row = (p: AsidePatient) => {
    const on = p.id === activeId;
    return (
      <li key={p.id}>
        <Link
          href={`/pacientes/${p.id}`}
          aria-current={on ? "page" : undefined}
          className={cx(
            "flex items-center gap-3",
            page ? "rounded-2xl border border-line bg-surface px-3.5 py-3 active:bg-hover" : cx("rounded-xl px-2.5 py-2.5", on ? "bg-accent-soft" : "hover:bg-hover"),
          )}
        >
          <span
            className={cx(
              "grid shrink-0 place-items-center font-semibold",
              page ? "size-12 rounded-xl text-[15px]" : "size-10 rounded-full text-[13px]",
              on ? "bg-accent text-white" : p.tags[0]?.k === "aula" ? "bg-chart-out/15 text-[#a85a17]" : "bg-accent-soft text-accent",
            )}
          >
            {initials(p.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate font-semibold", page && "text-[16px]")}>{p.name}</span>
            <span className={cx("block truncate text-muted", page ? "text-[14px]" : "text-[13px]")}>{p.summary || p.phone || "Sem telefone"}</span>
          </span>
          {p.tags.length > 0 && (
            <span className="flex shrink-0 flex-col items-end gap-1">
              {p.tags.slice(0, 2).map((t) => (
                <span
                  key={t.n}
                  className={cx(
                    "rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase",
                    t.k === "aula" ? "bg-chart-out/15 text-[#a85a17]" : "bg-chart-in/15 text-accent",
                  )}
                >
                  {t.n}
                </span>
              ))}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const chipCls = (on: boolean) =>
    cx(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 font-medium whitespace-nowrap",
      page ? "min-h-11 text-[15px]" : "min-h-9 text-[13px]",
      on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted",
    );
  const count = (n: number) => <span className="grid min-w-6 place-items-center rounded-full bg-hover px-1.5 text-[12px] font-semibold text-ink tabular-nums">{n}</span>;

  return (
    <div className={cx("flex flex-col", !page && "h-full")}>
      <div className={cx("space-y-3", page ? "pb-3" : "px-4 pt-7 pb-3")}>
        <div>
          <h1 className={cx("font-semibold tracking-tight", page ? "text-[26px] leading-tight" : "text-[22px]")}>Pacientes</h1>
          <p className="text-[14px] text-muted">
            {activeCount} paciente{activeCount === 1 ? "" : "s"} na sua clínica
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar paciente…"
              aria-label="Buscar paciente"
              className={cx(
                "w-full rounded-xl border border-line pr-3 pl-9 text-[16px] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none",
                page ? "h-12 bg-surface" : "h-11 bg-bg",
              )}
            />
          </div>
          {canAdd && (
            <Link href="/pacientes/novo" className={cx(buttonClass("primary", page ? "lg" : "sm"), "shrink-0")}>
              <Plus size={18} /> Novo
            </Link>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-hover p-1" role="tablist">
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
              className={cx(
                "flex items-center justify-center gap-1 rounded-lg font-medium",
                page ? "h-10 text-[14px]" : "h-9 text-[13px]",
                tab === o.k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {o.dot && <span className={cx("size-1.5 rounded-full", o.dot)} />}
              {o.l}
            </button>
          ))}
        </div>
        <div className={cx("flex gap-1.5", page ? "-mx-5 overflow-x-auto px-5 pb-1" : "flex-wrap")}>
          <button type="button" aria-pressed={chip === "aniversario"} onClick={() => setChip(chip === "aniversario" ? "" : "aniversario")} className={chipCls(chip === "aniversario")}>
            <Cake size={15} /> Aniversariantes do mês {count(birthdays)}
          </button>
          <button type="button" aria-pressed={chip === "sem"} onClick={() => setChip(chip === "sem" ? "" : "sem")} className={chipCls(chip === "sem")}>
            Sem sessão {count(noSession)}
          </button>
          {atRisk > 0 && (
            <button type="button" aria-pressed={chip === "risco"} onClick={() => setChip(chip === "risco" ? "" : "risco")} className={cx(chipCls(chip === "risco"), chip !== "risco" && "text-warn")}>
              <AlertTriangle size={15} /> Em risco {count(atRisk)}
            </button>
          )}
        </div>
      </div>

      <div className={cx(!page && "flex-1 overflow-y-auto px-2 pb-4")}>
        {recentList.length > 0 && (
          <>
            <p className={cx("mt-1 mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase", !page && "px-2.5")}>Recentes</p>
            <ul className={cx(page ? "space-y-2" : "")}>{recentList.map(row)}</ul>
            <p className={cx("mt-4 mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase", !page && "px-2.5")}>Todos</p>
          </>
        )}
        <ul className={cx(page ? "space-y-2" : "")}>
          {rest.length === 0 && recentList.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Ninguém encontrado.</li>}
          {rest.map(row)}
        </ul>
      </div>
      {canAdd && (
        <Link
          href="/pacientes/importar"
          className={cx("flex min-h-12 items-center justify-center gap-2 text-sm font-medium text-muted hover:text-ink", page ? "mt-4" : "border-t border-line")}
        >
          <FileSpreadsheet size={16} /> Importar planilha
        </Link>
      )}
    </div>
  );
}

/** No celular, a lista é a própria tela /pacientes. */
export function PatientsMobileList(props: { patients: AsidePatient[]; month: string; canAdd: boolean }) {
  const path = usePathname();
  if (path !== "/pacientes") return null;
  return (
    <div className="lg:hidden">
      <PatientsAside {...props} variant="page" />
    </div>
  );
}
