// Tema da clínica: a cor escolhida em Identidade vira a cor de destaque do app inteiro
// (botões, abas, links, títulos de campo, selos). Cores claras são escurecidas para o texto continuar legível.

const DEFAULT = "#0f766e";

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function hex([r, g, b]: [number, number, number]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function lum([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrastWithWhite = (c: [number, number, number]) => 1.05 / (lum(c) + 0.05);
const mix = (a: [number, number, number], b: [number, number, number], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];

/** Paleta derivada da cor da clínica. */
export function brandPalette(color: string | null | undefined) {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT;
  let c = rgb(base);
  // texto em cor de destaque sobre branco precisa de contraste >= 4.5
  for (let i = 0; i < 20 && contrastWithWhite(c) < 4.6; i++) c = mix(c, [0, 0, 0], 0.08);
  const accent = hex(c);
  const strong = hex(mix(c, [0, 0, 0], 0.18));
  const soft = hex(mix(c, [255, 255, 255], 0.9));
  return { accent, strong, soft };
}

/** CSS que troca as variáveis de cor do app (vai num <style> no topo da página). */
export function brandCss(color: string | null | undefined) {
  const p = brandPalette(color);
  return `:root{--color-accent:${p.accent};--color-accent-strong:${p.strong};--color-accent-soft:${p.soft}}`;
}
