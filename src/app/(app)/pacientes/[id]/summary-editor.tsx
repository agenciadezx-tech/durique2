"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { updateSummary } from "../actions";

/** Resumo de uma linha do paciente, editável no próprio lugar. */
export function SummaryEditor({ id, value, canEdit }: { id: string; value: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-surface p-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateSummary(id, text);
            if (r.error) setError(r.error);
            else {
              setSaved(text.trim());
              setEditing(false);
              setError(null);
            }
          });
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={140}
          placeholder="Ex.: Lombalgia crônica · quer voltar a correr"
          aria-label="Resumo do paciente"
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[16px] outline-none"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? "…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className={buttonClass("ghost", "sm")}>
          Cancelar
        </button>
        {error && <p className="w-full px-2 text-sm text-bad">{error}</p>}
      </form>
    );
  }
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => setEditing(true)}
      className={cx(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left",
        canEdit && "hover:border-faint",
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Resumo</span>
      <span className={cx("min-w-0 flex-1 truncate text-[15px]", !saved && "text-faint")}>
        {saved || (canEdit ? "Toque para adicionar (ex.: lombalgia crônica, gestante, objetivo)" : "Sem resumo")}
      </span>
      {canEdit && <Pencil size={16} className="shrink-0 text-faint" />}
    </button>
  );
}
