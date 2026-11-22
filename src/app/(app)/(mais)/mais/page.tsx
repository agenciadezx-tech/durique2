import { LayoutGrid, LogOut } from "lucide-react";
import { MaisNav } from "@/components/mais-nav";
import { PageHeader } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { maisGroups } from "@/lib/mais-menu";

export const metadata = { title: "Menu" };

export default async function MaisPage() {
  const ctx = await getContext();
  return (
    <>
      {/* Celular: a própria lista */}
      <div className="lg:hidden">
        <PageHeader title="Menu" description="Resultados, dinheiro, divulgação e tudo da sua clínica." />
        <div className="space-y-8">
          <MaisNav groups={maisGroups(ctx)} />
          <form action="/auth/sair" method="post" className="rounded-2xl border border-line bg-surface p-4">
            <p className="truncate text-sm font-medium">{ctx.email}</p>
            <p className="text-sm text-muted">
              {ROLE_LABEL[ctx.role]} · {ctx.clinicName}
            </p>
            <button className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-ink">
              <LogOut size={18} /> Sair
            </button>
          </form>
        </div>
      </div>
      {/* Computador: a lista já está à esquerda */}
      <div className="hidden min-h-[70vh] flex-col items-center justify-center text-center lg:flex">
        <span className="grid size-16 place-items-center rounded-2xl border border-line bg-surface text-muted">
          <LayoutGrid size={28} />
        </span>
        <p className="mt-4 text-lg font-semibold">Escolha uma seção à esquerda</p>
        <p className="mt-1 max-w-sm text-[15px] text-muted">
          {ctx.clinicName} · {ROLE_LABEL[ctx.role]}
        </p>
      </div>
    </>
  );
}
