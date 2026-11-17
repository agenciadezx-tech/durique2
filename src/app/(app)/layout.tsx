import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { BottomNav, SideNav } from "@/components/nav";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { ClinicMark } from "@/components/clinic-mark";
import { textOn } from "@/lib/colors";
import { cx } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const brand = ctx.brandColor ?? "#0f766e";
  const tone = textOn(brand);
  const fg = tone === "light" ? "text-white" : "text-black";
  const mark = ctx.clinicLogo ? (
    <ClinicMark brand={{ name: ctx.clinicName, logo: ctx.clinicLogo, color: brand }} size={40} />
  ) : (
    <span className={cx("rounded-xl p-0.5", tone === "light" ? "bg-white/20" : "bg-black/10")}>
      <Logo compact />
    </span>
  );
  return (
    <div className="lg:flex">
      {/* Computador: trilho estreito com os 5 itens do menu */}
      <aside className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center py-5 lg:flex print:!hidden" style={{ background: brand }}>
        <Link href="/agenda" title={`${ctx.clinicName} · ${ROLE_LABEL[ctx.role]}`} aria-label={`${ctx.clinicName}: início`}>
          {mark}
        </Link>
        <div className="mt-6 w-full flex-1 px-2">
          <SideNav tone={tone} />
        </div>
        <form action="/auth/sair" method="post" className="w-full px-2">
          <button
            title={ctx.email}
            className={cx(
              "flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[12px] font-medium",
              tone === "light" ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-black/60 hover:bg-black/5",
            )}
          >
            <LogOut size={19} /> Sair
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1 overflow-x-clip">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 px-5 lg:hidden print:hidden" style={{ background: brand }}>
          {ctx.clinicLogo ? <ClinicMark brand={{ name: ctx.clinicName, logo: ctx.clinicLogo, color: brand }} size={34} /> : mark}
          <span className={cx("truncate text-[15px] font-semibold", fg)}>{ctx.clinicName}</span>
        </header>
        <main className="mx-auto w-full max-w-4xl px-5 pt-6 pb-28 has-[[data-wide]]:max-w-6xl has-[[data-split]]:max-w-none! has-[[data-split]]:p-0! lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
