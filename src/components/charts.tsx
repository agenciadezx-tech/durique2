import type { ReactNode } from "react";
import { cx } from "./ui";

/** Número de destaque (sem gráfico). */
export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cx(
          "mt-1 text-[28px] leading-none font-semibold tracking-tight tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

type Point = { label: string; value: number; full?: string };

function NumbersTable({ data, format, valueLabel }: { data: Point[]; format: (n: number) => string; valueLabel: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted hover:text-ink">Ver os números</summary>
      <table className="mt-1 w-full">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-line">
              <td className="py-1.5 capitalize">{d.full ?? d.label}</td>
              <td className="py-1.5 text-right tabular-nums">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Barras verticais de uma série (ex.: por mês). Tooltip no hover/foco; o último valor fica escrito. */
export function ColumnChart({
  title,
  subtitle,
  data,
  format = (n) => n.toLocaleString("pt-BR"),
  valueLabel = "Total",
}: {
  title: string;
  subtitle?: string;
  data: Point[];
  format?: (n: number) => string;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data.length - 1;
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <figcaption>
        <p className="font-semibold">{title}</p>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </figcaption>
      <div className="mt-6 flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label={`${title}: ${data.map((d) => `${d.full ?? d.label} ${format(d.value)}`).join("; ")}`}>
        {data.map((d, i) => (
          <div key={d.label} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center outline-none">
            {i === last && (
              <span className="absolute text-[12px] font-medium text-ink tabular-nums group-hover:invisible group-focus:invisible" style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}>
                {format(d.value)}
              </span>
            )}
            <div
              className={cx("w-full max-w-10 rounded-t-[4px] transition-opacity", i === last ? "bg-accent" : "bg-accent/55", "group-hover:opacity-80")}
              style={{ height: d.value > 0 ? `max(3px, ${(d.value / max) * 100}%)` : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-lg bg-ink px-2 py-1 text-[12px] whitespace-nowrap text-white shadow group-hover:block group-focus:block">
              <span className="capitalize">{d.full ?? d.label}</span>: <span className="font-semibold tabular-nums">{format(d.value)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[12px] text-muted capitalize">
            {d.label}
          </span>
        ))}
      </div>
      <NumbersTable data={data} format={format} valueLabel={valueLabel} />
    </figure>
  );
}

/** Barras horizontais ordenadas (ex.: por serviço). Rótulo e valor escritos em cada linha. */
export function BarList({
  title,
  subtitle,
  data,
  format = (n) => n.toLocaleString("pt-BR"),
  empty,
}: {
  title: string;
  subtitle?: string;
  data: Point[];
  format?: (n: number) => string;
  empty: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <figcaption>
        <p className="font-semibold">{title}</p>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </figcaption>
      {data.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((d) => (
            <li key={d.label}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="truncate">{d.label}</span>
                <span className="font-medium tabular-nums">{format(d.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-hover">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
