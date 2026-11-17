"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Aba que desliza da direita com um formulário, sem sair da tela atual.
 * Usada pelas rotas interceptadas em src/app/(app)/@drawer. Fechar = voltar.
 */
export function Drawer({ children, label }: { children: ReactNode; label: string }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.back();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [router]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Fechar" onClick={() => router.back()} className="absolute inset-0 cursor-default bg-ink/30 backdrop-blur-[1px]" />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xl flex-col overflow-x-clip overflow-y-auto bg-bg shadow-2xl outline-none [&_[data-back]]:hidden"
        style={{ animation: "drawer-in 180ms ease-out" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Fechar"
          className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted shadow-sm hover:text-ink"
        >
          <X size={20} />
        </button>
        <div className="px-5 pt-6 pb-10 sm:px-7 [&>header:first-child]:pr-12">{children}</div>
      </div>
    </div>
  );
}
