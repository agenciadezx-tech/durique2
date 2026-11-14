"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./ui";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass("secondary")} print:hidden`}>
      <Printer size={18} /> {label}
    </button>
  );
}
