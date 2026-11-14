import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { BottomNav, SideNav } from "@/components/nav";
import { getContext, ROLE_LABEL } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="lg:flex">
      <aside className="sticky top-0 hidden print:!hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo />
          <p className="mt-4 truncate text-sm font-medium">{ctx.clinicName}</p>
          <p className="truncate text-[13px] text-muted">{ROLE_LABEL[ctx.role]}</p>
        </div>
        <div className="mt-6 flex-1">
          <SideNav showFinance={ctx.role !== "profissional"} />
        </div>
        <form action="/auth/sair" method="post" className="px-1">
          <p className="mb-2 truncate px-2 text-[13px] text-faint">{ctx.email}</p>
          <button className="flex h-10 w-full items-center gap-3 rounded-xl px-2 text-sm text-muted hover:bg-hover hover:text-ink">
            <LogOut size={18} /> Sair
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 print:hidden items-center justify-between border-b border-line bg-bg/90 px-5 backdrop-blur lg:hidden">
          <Logo compact />
          <span className="truncate pl-3 text-sm font-medium text-muted">{ctx.clinicName}</span>
        </header>
        <main className="mx-auto w-full max-w-4xl px-5 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
      </div>
      <BottomNav showFinance={ctx.role !== "profissional"} />
    </div>
  );
}
