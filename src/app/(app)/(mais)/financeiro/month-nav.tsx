import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { addMonthsKey, formatMonth } from "@/lib/format";

/** Navegação ‹ mês › preservando os outros filtros da URL. */
export function MonthNav({ month, base, params = {} }: { month: string; base: string; params?: Record<string, string> }) {
  const href = (m: string) => `${base}?${new URLSearchParams({ ...params, mes: m }).toString()}`;
  return (
    <div className="flex items-center gap-1">
      <Link href={href(addMonthsKey(month, -1))} className={buttonClass("ghost", "sm")} aria-label="Mês anterior">
        <ChevronLeft size={18} />
      </Link>
      <span className="min-w-36 text-center text-[15px] font-semibold">{formatMonth(month)}</span>
      <Link href={href(addMonthsKey(month, 1))} className={buttonClass("ghost", "sm")} aria-label="Próximo mês">
        <ChevronRight size={18} />
      </Link>
    </div>
  );
}
