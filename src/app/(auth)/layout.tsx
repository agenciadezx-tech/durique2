import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        {children}
        <p className="mt-8 text-center text-[13px] text-faint">
          <Link href="/termos" className="hover:underline">
            Termos de uso
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>
        </p>
      </div>
    </main>
  );
}
