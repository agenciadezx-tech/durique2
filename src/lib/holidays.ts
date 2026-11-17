import { addDaysISO } from "@/lib/format";

/** Domingo de Páscoa (algoritmo gregoriano anônimo). */
function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Feriados nacionais (e pontos facultativos mais comuns) do ano. */
export function nationalHolidays(y: number): { date: string; name: string }[] {
  const p = easter(y);
  const fixed: [string, string][] = [
    ["01-01", "Ano Novo"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Consciência Negra"],
    ["12-24", "Véspera de Natal"],
    ["12-25", "Natal"],
    ["12-31", "Véspera de Ano Novo"],
  ];
  return [
    ...fixed.map(([md, name]) => ({ date: `${y}-${md}`, name })),
    { date: addDaysISO(p, -48), name: "Carnaval (segunda)" },
    { date: addDaysISO(p, -47), name: "Carnaval (terça)" },
    { date: addDaysISO(p, -2), name: "Sexta-feira Santa" },
    { date: addDaysISO(p, 60), name: "Corpus Christi" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
