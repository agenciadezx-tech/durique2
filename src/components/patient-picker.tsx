"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cx } from "./ui";

type P = { id: string; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca de paciente amigável: digita parte do nome e toca. Envia `name` no formulário. */
export function PatientPicker({ patients, name = "patient_id" }: { patients: P[]; name?: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<P | null>(null);
  const list = useMemo(() => {
    const t = norm(q.trim());
    return (t ? patients.filter((p) => norm(p.name).includes(t)) : patients).slice(0, 6);
  }, [q, patients]);

  if (!patients.length) return <p className="text-[15px] text-muted">Nenhum paciente disponível. Cadastre em Pacientes.</p>;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input
          value={picked ? picked.name : q}
          onChange={(e) => {
            setPicked(null);
            setQ(e.target.value);
          }}
          placeholder="Digite o nome do paciente"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-3.5 pl-10 text-[16px] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          aria-label="Buscar paciente"
        />
      </div>
      {!picked && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {list.length ? (
            list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPicked(p)}
                  className="flex h-11 w-full items-center px-3.5 text-left text-[15px] hover:bg-hover"
                >
                  {p.name}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3.5 py-3 text-[15px] text-muted">Ninguém encontrado com “{q}”.</li>
          )}
        </ul>
      )}
      {picked && (
        <p className={cx("flex items-center gap-1.5 text-sm text-accent")}>
          <Check size={16} /> Selecionado.{" "}
          <button type="button" className="underline" onClick={() => setPicked(null)}>
            Trocar
          </button>
        </p>
      )}
    </div>
  );
}
