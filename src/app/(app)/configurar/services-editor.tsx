"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Suggestion } from "@/lib/setup";
import { cx } from "@/components/ui";

type Row = { key: string; id?: string; name: string; kind: "individual" | "turma"; duration: number; price: string; remove?: boolean };

const inputCls =
  "h-11 rounded-lg border border-line bg-surface px-2.5 text-[16px] tabular-nums focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none";

/** Lista editável de serviços do passo 5 (nome, minutos, preço avulso) + botões de sugestão. */
export function ServicesEditor({
  initial,
  extras,
  showConsultas,
  showAulas,
  capacity,
}: {
  initial: Omit<Row, "key">[];
  extras: { individual: Suggestion[]; turma: Suggestion[] };
  showConsultas: boolean;
  showAulas: boolean;
  capacity: number;
}) {
  const [rows, setRows] = useState<Row[]>(initial.map((r, i) => ({ ...r, key: r.id ?? `n${i}` })));
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (s: Suggestion) => setRows((rs) => [...rs, { key: `n${Date.now()}`, name: s.name, kind: s.kind, duration: s.duration, price: "" }]);

  const groups = [
    { kind: "individual" as const, title: "Consultas", dot: "bg-chart-in", bg: "bg-chart-in/8", show: showConsultas },
    { kind: "turma" as const, title: "Aulas", dot: "bg-chart-out", bg: "bg-chart-out/8", show: showAulas },
  ];

  return (
    <div className="space-y-5">
      <input type="hidden" name="rows" value={JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, duration: r.duration, price: r.price, remove: r.remove })))} />
      {groups
        .filter((g) => g.show || rows.some((r) => r.kind === g.kind && !r.remove))
        .map((g) => {
          const list = rows.filter((r) => r.kind === g.kind && !r.remove);
          const names = new Set(rows.filter((r) => !r.remove).map((r) => r.name.toLowerCase()));
          return (
            <section key={g.kind} className="overflow-hidden rounded-2xl border border-line">
              <header className={cx("flex items-center justify-between px-4 py-3", g.bg)}>
                <p className="flex items-center gap-2 font-semibold">
                  <span className={cx("size-2.5 rounded-full", g.dot)} /> {g.title}
                </p>
                <span className="text-sm text-muted">
                  {list.length} serviço{list.length === 1 ? "" : "s"}
                </span>
              </header>
              {g.kind === "turma" && (
                <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
                  <label htmlFor="capacity" className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">Vagas por turma</span>
                    <span className="text-muted">Quantos alunos cabem em cada aula. Dá para mudar por turma depois.</span>
                  </label>
                  <input id="capacity" name="capacity" type="number" min={1} max={50} defaultValue={capacity} className={cx(inputCls, "w-20 text-center")} />
                </div>
              )}
              <ul className="divide-y divide-line bg-surface">
                {list.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <input
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                      aria-label="Nome do serviço"
                      className={cx(inputCls, "min-w-40 flex-1 font-medium")}
                    />
                    <label className="flex items-center gap-1 text-sm text-muted">
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={r.duration}
                        onChange={(e) => update(r.key, { duration: Number(e.target.value) })}
                        aria-label={`Minutos de ${r.name}`}
                        className={cx(inputCls, "w-16 text-center")}
                      />
                      min
                    </label>
                    <label className="flex items-center gap-1 text-sm text-muted">
                      R$
                      <input
                        inputMode="decimal"
                        value={r.price}
                        placeholder="0,00"
                        onChange={(e) => update(r.key, { price: e.target.value })}
                        aria-label={`Preço avulso de ${r.name}`}
                        className={cx(inputCls, "w-24 text-right")}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => (r.id ? update(r.key, { remove: true }) : setRows((rs) => rs.filter((x) => x.key !== r.key)))}
                      aria-label={`Tirar ${r.name}`}
                      className="grid size-11 place-items-center rounded-lg text-faint hover:bg-hover hover:text-bad"
                    >
                      <X size={18} />
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nenhum. Toque numa sugestão abaixo.</li>}
              </ul>
              <div className="flex flex-wrap gap-2 border-t border-line bg-bg/60 px-4 py-3">
                {extras[g.kind]
                  .filter((s) => !names.has(s.name.toLowerCase()))
                  .map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => add(s)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-accent hover:text-accent"
                    >
                      <Plus size={14} /> {s.name}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => add({ name: "", kind: g.kind, duration: g.kind === "turma" ? 50 : 50 })}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-accent hover:bg-accent-soft"
                >
                  <Plus size={14} /> Outro
                </button>
              </div>
            </section>
          );
        })}
      <p className="text-[13px] text-muted">O preço aqui é o da sessão avulsa. Pacotes e planos mensais você monta depois em Serviços.</p>
    </div>
  );
}
