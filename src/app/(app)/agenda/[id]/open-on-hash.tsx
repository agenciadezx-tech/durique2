"use client";

import { useEffect } from "react";

/** Abre o <details id="..."> quando o link aponta para ele (ex.: botão "+ Aluno" → #adicionar). */
export function OpenOnHash({ id }: { id: string }) {
  useEffect(() => {
    const open = () => {
      if (location.hash !== `#${id}`) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.(`a[href="#${id}"]`);
      if (a) setTimeout(open, 0);
    };
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", click);
    };
  }, [id]);
  return null;
}
