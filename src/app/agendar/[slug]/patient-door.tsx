"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Alert, buttonClass, Field, Input } from "@/components/ui";
import { patientLogin } from "./actions";

/** "Já sou paciente": WhatsApp + data de nascimento abrem o painel do aluno. */
export function PatientDoor({ slug, color }: { slug: string; color: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await patientLogin(slug, phone, birth);
          if (r.token) router.push(`/p/${r.token}`);
          else setError(r.error ?? "Não foi possível entrar.");
        });
      }}
    >
      <p className="text-[15px] text-muted">Veja suas aulas, confirme, desmarque, reponha e pague pelo celular.</p>
      {error && <Alert>{error}</Alert>}
      <Field label="Seu WhatsApp">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required placeholder="(11) 99999-8888" />
      </Field>
      <Field label="Data de nascimento" hint="Para confirmar que é você.">
        <Input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" required />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", true)} style={{ background: color }}>
        <LogIn size={18} /> {pending ? "Entrando…" : "Entrar no meu painel"}
      </button>
    </form>
  );
}
