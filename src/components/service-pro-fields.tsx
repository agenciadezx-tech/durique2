"use client";

import { useState } from "react";
import { Field, Select } from "./ui";

type Svc = { id: string; name: string };
type Pro = { id: string; name: string; services: string[] };

/** Serviço + profissional: a lista de profissionais mostra só quem faz o serviço escolhido (quem não tem serviço marcado faz todos). */
export function ServiceProFields({ services, pros, defaultService, defaultPro }: { services: Svc[]; pros: Pro[]; defaultService?: string; defaultPro?: string }) {
  const [svc, setSvc] = useState(defaultService ?? services[0]?.id ?? "");
  const fits = pros.filter((p) => !p.services.length || p.services.includes(svc));
  const list = fits.length ? fits : pros;
  const [pro, setPro] = useState(defaultPro && list.some((p) => p.id === defaultPro) ? defaultPro : list.length === 1 ? list[0].id : "");
  const proOk = list.some((p) => p.id === pro);
  return (
    <>
      <Field label="Serviço">
        <Select
          name="service_id"
          required
          value={svc}
          onChange={(e) => {
            setSvc(e.target.value);
            const next = pros.filter((p) => !p.services.length || p.services.includes(e.target.value));
            if (next.length === 1) setPro(next[0].id);
          }}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Profissional" hint={fits.length && fits.length < pros.length ? "Só aparece quem faz este serviço." : undefined}>
        <Select name="professional_id" required value={proOk ? pro : ""} onChange={(e) => setPro(e.target.value)}>
          {list.length !== 1 && <option value="">Escolha…</option>}
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
