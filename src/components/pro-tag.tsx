import { proColor } from "@/lib/colors";
import { brandPalette } from "@/lib/theme";
import { cx } from "./ui";

/** Nome do profissional na cor dele (fundo clarinho + texto na cor, legível). Não tem a ver com a cor da clínica. */
export function ProTag({ pro, first = true, className }: { pro: { id?: string; name: string; color?: string | null } | null | undefined; first?: boolean; className?: string }) {
  if (!pro?.name) return null;
  const c = proColor(pro.color, pro.id);
  const p = brandPalette(c);
  return (
    <span
      className={cx("inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[12px] font-semibold", className)}
      style={{ background: p.soft, color: p.accent }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: c }} />
      <span className="truncate">{first ? pro.name.split(" ")[0] : pro.name}</span>
    </span>
  );
}
