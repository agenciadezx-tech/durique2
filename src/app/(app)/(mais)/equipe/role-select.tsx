"use client";

import { useRef } from "react";
import { setMemberRole } from "../ajustes/actions";

/** Trocar a função: escolhe na lista e já salva (com confirmação). */
export function RoleSelect({ memberId, role, who }: { memberId: string; role: string; who: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setMemberRole}>
      <input type="hidden" name="id" value={memberId} />
      <label className="sr-only" htmlFor={`role-${memberId}`}>
        Função de {who}
      </label>
      <select
        id={`role-${memberId}`}
        name="role"
        defaultValue={role}
        onChange={(e) => {
          if (confirm(`Mudar a função de ${who}? O que a pessoa vê no sistema muda na hora.`)) form.current?.requestSubmit();
          else e.target.value = role;
        }}
        className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[16px] sm:text-[15px]"
      >
        <option value="admin">Administrador</option>
        <option value="recepcao">Recepção</option>
        <option value="profissional">Profissional</option>
        <option value="financeiro">Financeiro</option>
      </select>
    </form>
  );
}
