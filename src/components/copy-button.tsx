"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "./ui";

export function CopyButton({ text, label = "Copiar link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Copie o link:", text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className={buttonClass("secondary", "sm")}
    >
      {done ? <Check size={16} className="text-ok" /> : <Copy size={16} />} {done ? "Copiado!" : label}
    </button>
  );
}
