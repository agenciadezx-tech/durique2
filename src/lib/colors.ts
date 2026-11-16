// Cores para identificar profissionais na agenda (distintas entre si e legíveis)
export const PRO_COLORS = [
  { hex: "#0f766e", name: "Verde-água" },
  { hex: "#2563eb", name: "Azul" },
  { hex: "#7c3aed", name: "Roxo" },
  { hex: "#e11d48", name: "Rosa" },
  { hex: "#d97706", name: "Laranja" },
  { hex: "#059669", name: "Verde" },
  { hex: "#0284c7", name: "Céu" },
  { hex: "#c026d3", name: "Magenta" },
] as const;

export const DEFAULT_PRO_COLOR = PRO_COLORS[0].hex;

/** Cor do profissional ou uma cor estável a partir do id */
export function proColor(color: string | null | undefined, id?: string): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (!id) return DEFAULT_PRO_COLOR;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRO_COLORS[h % PRO_COLORS.length].hex;
}
