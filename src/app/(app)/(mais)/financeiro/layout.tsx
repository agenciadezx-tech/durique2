import { redirect } from "next/navigation";
import { FinanceTabs } from "./tabs";
import { getContext } from "@/lib/context";

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  if (ctx.role === "profissional") redirect("/agenda");
  return (
    <>
      <FinanceTabs showCommissions={ctx.canSeeExpenses} />
      {children}
    </>
  );
}
