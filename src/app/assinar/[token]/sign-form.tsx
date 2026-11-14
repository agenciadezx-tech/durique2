"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SignaturePad } from "@/components/signature-pad";
import { Field, Input } from "@/components/ui";
import { signDocument } from "./actions";

export function SignForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [empty, setEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  return (
    <ActionForm action={signDocument}>
      <input type="hidden" name="token" value={token} />
      <Field label="Seu nome completo">
        <Input name="signer_name" required defaultValue={defaultName} autoComplete="name" />
      </Field>
      <SignaturePad onChange={setEmpty} />
      <label className="flex items-start gap-2.5 text-[15px]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
        Li e concordo com o documento acima.
      </label>
      <div className={empty || !agree ? "pointer-events-none opacity-50" : ""}>
        <SubmitButton full pendingText="Assinando…">
          Assinar documento
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
