import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { BottomNav, SideNav } from "@/components/nav";
import { getContext, ROLE_LABEL } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="lg:flex">
      {/* Computador: trilho estreito com os 5 itens do menu */}
      <aside className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center border-r border-line bg-surface py-5 lg:flex print:!hidden">
        <Link href="/agenda" title={`${ctx.clinicName} · ${ROLE_LABEL[ctx.role]}`} aria-label="Durique — início">
          <Logo compact />
        </Link>
        <div className="mt-6 w-full flex-1 px-2">
          <SideNav />
        </div>
        <form action="/auth/sair" method="post" className="w-full px-2">
          <button
            title={ctx.email}
            className="flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[12px] font-medium text-muted hover:bg-hover hover:text-ink"
          >
            <LogOut size={19} /> Sair
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 print:hidden items-center justify-between border-b border-line bg-bg/90 px-5 backdrop-blur lg:hidden">
          <Logo compact />
          <span className="truncate pl-3 text-sm font-medium text-muted">{ctx.clinicName}</span>
        </header>
        <main className="mx-auto w-full max-w-4xl px-5 pt-6 pb-28 has-[[data-wide]]:max-w-6xl has-[[data-split]]:max-w-none! has-[[data-split]]:p-0! lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
