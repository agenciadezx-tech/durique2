"use client";

import { useState } from "react";
import { cx } from "./ui";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlShort = (c: number) => {
  const v = c / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10000 ? 0 : 1 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cx("size-2.5 rounded-sm", i.className)} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export type MonthFlow = { key: string; label: string; full: string; in: number; out: number };

/** Entrou × saiu por mês (colunas lado a lado). Sem despesas, mostra só o que entrou. */
export function InOutChart({ data, showOut }: { data: MonthFlow[]; showOut: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => (showOut ? [d.in, d.out] : [d.in])));
  const ticks = [0.5, 1].map((f) => max * f);
  const active = hover ?? data.length - 1;
  const a = data[active];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showOut ? (
          <Legend
            items={[
              { label: "Entrou", className: "bg-chart-in" },
              { label: "Saiu", className: "bg-chart-out" },
            ]}
          />
        ) : (
          <span />
        )}
        {/* Leitura do mês selecionado (passe o dedo/mouse nas colunas) */}
        <div className="text-right text-[13px]">
          <p className="font-medium text-ink">{a.full}</p>
          <p className="text-muted tabular-nums">
            Entrou <span className="font-semibold text-ink">{brl(a.in)}</span>
            {showOut && (
              <>
                {" "}· Saiu <span className="font-semibold text-ink">{brl(a.out)}</span> · Sobrou{" "}
                <span className={cx("font-semibold", a.in - a.out >= 0 ? "text-ok" : "text-bad")}>{brl(a.in - a.out)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-4 h-44">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -top-2 left-0 bg-surface pr-1 text-[11px] text-faint tabular-nums">{brlShort(t)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1 border-b border-line pl-12">
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              aria-label={`${d.full}: entrou ${brl(d.in)}${showOut ? `, saiu ${brl(d.out)}` : ""}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={cx("flex h-full flex-1 items-end justify-center gap-[2px] rounded-t-md outline-none", i === active && "bg-hover/70")}
            >
              <span
                className="w-full max-w-7 rounded-t-[4px] bg-chart-in"
                style={{ height: d.in ? `max(3px, ${(d.in / max) * 100}%)` : 0 }}
              />
              {showOut && (
                <span
                  className="w-full max-w-7 rounded-t-[4px] bg-chart-out"
                  style={{ height: d.out ? `max(3px, ${(d.out / max) * 100}%)` : 0 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 pl-12">
        {data.map((d, i) => (
          <span key={d.key} className={cx("flex-1 text-center text-[12px] capitalize", i === active ? "font-semibold text-ink" : "text-muted")}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Quanto já entrou no mês, dia a dia (acumulado). */
export function MonthPaceChart({ days, todayIndex }: { days: { label: string; total: number }[]; todayIndex: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const shown = days.slice(0, todayIndex + 1);
  const max = Math.max(1, ...shown.map((d) => d.total));
  const x = (i: number) => (days.length <= 1 ? 0 : (i / (days.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 8);
  const line = shown.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");
  const area = shown.length ? `${line} L${x(shown.length - 1).toFixed(1)},${H} L0,${H} Z` : "";
  const active = hover != null && hover < shown.length ? hover : shown.length - 1;
  const a = shown[active];

  return (
    <div>
      <p className="text-[13px] text-muted">
        Até dia {a?.label}: <span className="font-semibold text-ink tabular-nums">{brl(a?.total ?? 0)}</span>
      </p>
      <div
        className="relative mt-3"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - r.left) / r.width) * (days.length - 1)));
        }}
        onTouchMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.touches[0].clientX - r.left) / r.width) * (days.length - 1)));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label={`Recebido no mês até hoje: ${brl(shown.at(-1)?.total ?? 0)}`}>
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {area && <path d={area} className="fill-chart-in/12" />}
          {line && <path d={line} fill="none" className="stroke-chart-in" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {a && (
            <line x1={x(active)} x2={x(active)} y1="0" y2={H} className="stroke-faint" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {a && (
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-chart-in"
            style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(a.total) / H) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>dia 1</span>
        <span>dia {Math.ceil(days.length / 2)}</span>
        <span>dia {days.length}</span>
      </div>
    </div>
  );
}
