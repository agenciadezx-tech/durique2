import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileSpreadsheet, FileText, Receipt } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { getContext } from "@/lib/context";
import { addMonthsKey, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AccountantForm } from "./accountant-form";

export const metadata = { title: "Notas fiscais" };

export default async function NotasPage() {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) redirect("/financeiro");
  const supabase = await createClient();
  const { data: pros } = await supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name");
  const lastMonth = addMonthsKey(todayISO().slice(0, 7), -1);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Notas fiscais e contador</h1>
        <p className="text-[15px] text-muted">Tudo o que a clínica fez no mês, pronto para mandar ao contador.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <FileSpreadsheet size={21} />
            </span>
            <div>
              <h2 className="text-[18px] font-semibold">Planilha do contador</h2>
              <p className="text-sm text-muted">
                Preenchida sozinha com o que foi lançado no período: recebimentos, despesas, caixa do dia a dia, o que venceu e o que falta receber.
              </p>
            </div>
          </div>
          <AccountantForm month={lastMonth} pros={pros ?? []} />
        </Card>

        <div className="space-y-4">
          <Link href="/financeiro/carne-leao" className="block">
            <Card className="flex items-start gap-3 p-4 transition-colors hover:border-faint">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover text-muted">
                <FileText size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Carnê-Leão</span>
                <span className="text-sm text-muted">Arquivo do mês para importar no Carnê-Leão Web da Receita (profissional autônomo).</span>
              </span>
              <ChevronRight size={18} className="mt-1 text-faint" />
            </Card>
          </Link>
          <Card className="flex items-start gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover text-muted">
              <Receipt size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                Nota fiscal (NFS-e) <Badge tone="warn">Em breve</Badge>
              </span>
              <span className="text-sm text-muted">Emitir a nota de cada recebimento direto daqui. Chega junto com o recebimento automático.</span>
            </span>
          </Card>
          <p className="px-1 text-[13px] text-muted">
            Dica: quanto mais completo o lançamento (paciente com CPF, forma de pagamento, categoria), mais pronta a planilha chega ao contador.
          </p>
        </div>
      </div>
    </>
  );
}
