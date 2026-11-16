"use client";

import { cx } from "./ui";

/**
 * Mapa de dor: boneco de frente e de costas com pontos clicáveis.
 * Na vista de frente, o lado DIREITO do paciente fica à ESQUERDA de quem olha.
 */
type Spot = { region: string; x: number; y: number };

const FRONT: Spot[] = [
  { region: "Cabeça", x: 60, y: 20 },
  { region: "Ombro direito", x: 37, y: 52 },
  { region: "Ombro esquerdo", x: 83, y: 52 },
  { region: "Cotovelo direito", x: 27, y: 92 },
  { region: "Cotovelo esquerdo", x: 93, y: 92 },
  { region: "Punho/mão direita", x: 21, y: 128 },
  { region: "Punho/mão esquerda", x: 99, y: 128 },
  { region: "Quadril direito", x: 48, y: 122 },
  { region: "Quadril esquerdo", x: 72, y: 122 },
  { region: "Joelho direito", x: 49, y: 178 },
  { region: "Joelho esquerdo", x: 71, y: 178 },
  { region: "Tornozelo/pé direito", x: 49, y: 236 },
  { region: "Tornozelo/pé esquerdo", x: 71, y: 236 },
];
const BACK: Spot[] = [
  { region: "Cervical", x: 60, y: 40 },
  { region: "Torácica", x: 60, y: 70 },
  { region: "Lombar", x: 60, y: 104 },
];

function Silhouette() {
  return (
    <g className="fill-hover stroke-line" strokeWidth="1.5">
      <circle cx="60" cy="20" r="13" />
      <rect x="54" y="32" width="12" height="8" rx="3" />
      <rect x="38" y="40" width="44" height="76" rx="14" />
      <rect x="22" y="44" width="13" height="84" rx="6.5" transform="rotate(6 28 44)" />
      <rect x="85" y="44" width="13" height="84" rx="6.5" transform="rotate(-6 92 44)" />
      <rect x="41" y="108" width="17" height="136" rx="8" />
      <rect x="62" y="108" width="17" height="136" rx="8" />
    </g>
  );
}

function Figure({
  title,
  spots,
  value,
  onToggle,
  readOnly,
}: {
  title: string;
  spots: Spot[];
  value: string[];
  onToggle?: (r: string) => void;
  readOnly?: boolean;
}) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 252" className="h-60 w-auto" role="group" aria-label={`Corpo visto de ${title.toLowerCase()}`}>
        <Silhouette />
        {spots.map((s) => {
          const on = value.includes(s.region);
          const circle = (
            <>
              <circle cx={s.x} cy={s.y} r={on ? 7.5 : 6} className={cx(on ? "fill-bad stroke-surface" : "fill-surface stroke-faint")} strokeWidth="1.5" />
              {on && <circle cx={s.x} cy={s.y} r="12" className="fill-bad/20" />}
            </>
          );
          return readOnly ? (
            <g key={s.region}>
              <title>{s.region}</title>
              {circle}
            </g>
          ) : (
            <g
              key={s.region}
              role="checkbox"
              aria-checked={on}
              aria-label={s.region}
              tabIndex={0}
              onClick={() => onToggle?.(s.region)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onToggle?.(s.region);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>circle:first-of-type]:stroke-accent"
            >
              <title>{s.region}</title>
              <circle cx={s.x} cy={s.y} r="14" className="fill-transparent" />
              {circle}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[13px] text-muted">{title}</figcaption>
    </figure>
  );
}

export function BodyMap({ value, onToggle, readOnly }: { value: string[]; onToggle?: (r: string) => void; readOnly?: boolean }) {
  return (
    <div className="flex justify-center gap-6 rounded-2xl border border-line bg-surface px-4 py-3">
      <Figure title="Frente" spots={FRONT} value={value} onToggle={onToggle} readOnly={readOnly} />
      <Figure title="Costas" spots={BACK} value={value} onToggle={onToggle} readOnly={readOnly} />
    </div>
  );
}
