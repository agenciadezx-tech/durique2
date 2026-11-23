import Link from "next/link";
import { Logo } from "@/components/logo";

/** Páginas públicas de Termos de uso e Política de privacidade. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg px-5 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-8 inline-block">
          <Logo />
        </Link>
        <article className="space-y-5 rounded-2xl border border-line bg-surface p-6 text-[16px] leading-relaxed sm:p-8 [&_h1]:text-[26px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h2]:pt-2 [&_h2]:text-[18px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </article>
        <p className="mt-6 text-center text-[14px] text-muted">
          <Link href="/termos" className="hover:underline">
            Termos de uso
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="hover:underline">
            Política de privacidade
          </Link>
        </p>
      </div>
    </main>
  );
}
