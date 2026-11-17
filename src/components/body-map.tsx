"use client";


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

const SKIN = "#F1C7A5";
const SKIN_LINE = "#D59D78";
const HAIR = "#5B3A29";
const SHIRT = "#7CC3C9";
const SHORTS = "#4F6DA8";

/** Boneco colorido (pele, cabelo, camiseta e bermuda). De costas, o cabelo cobre a cabeça. */
function Silhouette({ back }: { back?: boolean }) {
  return (
    <g strokeWidth="1.2" strokeLinejoin="round">
      {/* braços */}
      <rect x="22" y="44" width="13" height="84" rx="6.5" transform="rotate(6 28 44)" fill={SKIN} stroke={SKIN_LINE} />
      <rect x="85" y="44" width="13" height="84" rx="6.5" transform="rotate(-6 92 44)" fill={SKIN} stroke={SKIN_LINE} />
      {/* pernas */}
      <rect x="41" y="108" width="17" height="136" rx="8" fill={SKIN} stroke={SKIN_LINE} />
      <rect x="62" y="108" width="17" height="136" rx="8" fill={SKIN} stroke={SKIN_LINE} />
      {/* pescoço e cabeça */}
      <rect x="54" y="30" width="12" height="10" rx="3" fill={SKIN} stroke={SKIN_LINE} />
      <circle cx="60" cy="20" r="13" fill={back ? HAIR : SKIN} stroke={back ? HAIR : SKIN_LINE} />
      {!back && <path d="M47 18 a13 13 0 0 1 26 0 q-6 -6 -13 -5 q-7 -1 -13 5z" fill={HAIR} />}
      {/* camiseta com mangas */}
      <path d="M38 52 q0 -12 14 -12 h16 q14 0 14 12 v62 h-44z" fill={SHIRT} stroke="#5AA6AD" />
      <path d="M38 50 l-12 6 l3 18 l10 -2z M82 50 l12 6 l-3 18 l-10 -2z" fill={SHIRT} stroke="#5AA6AD" />
      {!back && <path d="M54 40 q6 6 12 0" fill="none" stroke="#5AA6AD" />}
      {/* bermuda */}
      <path d="M38 110 h44 v40 h-19 l-3 -18 l-3 18 h-19z" fill={SHORTS} stroke="#3E5788" />
    </g>
  );
}

const LEVEL_FILL: Record<string, { dot: string; halo: string }> = {
  leve: { dot: "#2E9E5B", halo: "rgba(46,158,91,.25)" },
  media: { dot: "#E39B17", halo: "rgba(227,155,23,.28)" },
  forte: { dot: "#D64545", halo: "rgba(214,69,69,.28)" },
};
function levelOf(eva?: number | null) {
  if (eva == null) return LEVEL_FILL.forte;
  if (eva <= 3) return LEVEL_FILL.leve;
  if (eva <= 6) return LEVEL_FILL.media;
  return LEVEL_FILL.forte;
}

function Figure({
  title,
  spots,
  value,
  onToggle,
  readOnly,
  back,
  eva,
}: {
  title: string;
  spots: Spot[];
  value: string[];
  onToggle?: (r: string) => void;
  readOnly?: boolean;
  back?: boolean;
  eva?: number | null;
}) {
  const c = levelOf(eva);
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 252" className="h-60 w-auto" role="group" aria-label={`Corpo visto de ${title.toLowerCase()}`}>
        <Silhouette back={back} />
        {spots.map((s) => {
          const on = value.includes(s.region);
          const circle = (
            <>
              {on && <circle cx={s.x} cy={s.y} r="12" fill={c.halo} />}
              <circle cx={s.x} cy={s.y} r={on ? 7.5 : 5.5} fill={on ? c.dot : "#FFFFFF"} stroke={on ? "#FFFFFF" : "#8A9AA5"} strokeWidth="1.5" />
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

export function BodyMap({ value, onToggle, readOnly, eva }: { value: string[]; onToggle?: (r: string) => void; readOnly?: boolean; eva?: number | null }) {
  return (
    <div className="flex justify-center gap-6 rounded-2xl border border-line bg-gradient-to-b from-accent-soft/40 to-surface px-4 py-3">
      <Figure title="Frente" spots={FRONT} value={value} onToggle={onToggle} readOnly={readOnly} eva={eva} />
      <Figure title="Costas" spots={BACK} value={value} onToggle={onToggle} readOnly={readOnly} back eva={eva} />
    </div>
  );
}
