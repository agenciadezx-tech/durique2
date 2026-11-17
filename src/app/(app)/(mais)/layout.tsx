import { MaisNav } from "@/components/mais-nav";
import { getContext } from "@/lib/context";
import { maisGroups } from "@/lib/mais-menu";

/**
 * Tudo que fica dentro de "Mais". No computador: lista à esquerda, conteúdo à direita.
 * No celular: só o conteúdo (a lista é a própria página /mais).
 */
export default async function MaisLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div data-split className="lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col border-r border-line bg-surface lg:flex print:!hidden">
        <div className="px-5 pt-8 pb-4">
          <h1 className="text-[22px] font-semibold tracking-tight">Mais</h1>
          <p className="text-sm text-muted">Ferramentas, relatórios e ajustes da clínica.</p>
        </div>
        <nav aria-label="Seções do Mais" className="flex-1 overflow-y-auto px-3 pb-8">
          <MaisNav groups={maisGroups(ctx)} compact />
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-x-clip px-5 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-16">
        <div className="mx-auto w-full max-w-4xl has-[[data-wide]]:max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
