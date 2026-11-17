"use client";

import { useMemo, useState } from "react";
import { Check, Search, UserPlus } from "lucide-react";
import { cx } from "./ui";
import { formatPhone } from "@/lib/format";

type P = { id: string; name: string; phone?: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca de paciente amigável: digita parte do nome e toca. Envia `name` no formulário. */
export function PatientPicker({
  patients,
  name = "patient_id",
  initialId,
  allowNew = false,
}: {
  patients: P[];
  name?: string;
  initialId?: string;
  /** Mostra "Cadastrar paciente novo" (envia new_patient_name e new_patient_phone). */
  allowNew?: boolean;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<P | null>(() => patients.find((p) => p.id === initialId) ?? null);
  const list = useMemo(() => {
    const t = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    return (t ? patients.filter((p) => norm(p.name).includes(t) || (digits.length >= 4 && (p.phone ?? "").includes(digits))) : patients).slice(0, 6);
  }, [q, patients]);

  if (creating || (allowNew && !patients.length)) {
    const looksPhone = q.replace(/\D/g, "").length >= 8;
    return (
      <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent-soft/30 p-4">
        <p className="flex items-center gap-2 font-semibold text-accent">
          <UserPlus size={18} /> Paciente novo
        </p>
        <input type="hidden" name={name} value="" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome</span>
          <input
            name="new_patient_name"
            required
            autoFocus
            defaultValue={looksPhone ? "" : q}
            placeholder="Nome e sobrenome"
            className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[16px] focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">WhatsApp</span>
          <input
            name="new_patient_phone"
            type="tel"
            inputMode="tel"
            defaultValue={looksPhone ? q : ""}
            placeholder="(11) 99999-8888"
            className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[16px] focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </label>
        <p className="text-[13px] text-muted">O resto do cadastro (CPF, nascimento…) pode ser completado depois na ficha.</p>
        {patients.length > 0 && (
          <button type="button" onClick={() => setCreating(false)} className="text-sm font-medium text-muted underline">
            Escolher um paciente já cadastrado
          </button>
        )}
      </div>
    );
  }
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
          placeholder="Digite o nome ou telefone"
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
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-1.5 text-left text-[15px] hover:bg-hover"
                >
                  <span className="truncate">{p.name}</span>
                  {p.phone && <span className="shrink-0 text-sm text-muted tabular-nums">{formatPhone(p.phone)}</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3.5 py-3 text-[15px] text-muted">Ninguém encontrado com “{q}”.</li>
          )}
          {allowNew && (
            <li className="border-t border-line">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left text-[15px] font-semibold text-accent hover:bg-accent-soft/50"
              >
                <UserPlus size={18} /> {q.trim() && !list.length ? `Cadastrar “${q.trim()}” como paciente novo` : "Cadastrar paciente novo"}
              </button>
            </li>
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
