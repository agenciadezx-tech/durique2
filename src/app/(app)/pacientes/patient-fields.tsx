import { Field, Input, Textarea } from "@/components/ui";
import { formatCpf, formatPhone } from "@/lib/format";

type Patient = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  notes?: string | null;
};

export function PatientFields({ patient = {}, readOnly = false }: { patient?: Patient; readOnly?: boolean }) {
  return (
    <>
      <Field label="Nome completo" htmlFor="name">
        <Input id="name" name="name" required defaultValue={patient.name} disabled={readOnly} autoComplete="off" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="WhatsApp" htmlFor="phone" hint="Com DDD. Usado para lembretes.">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(11) 99999-8888"
            defaultValue={formatPhone(patient.phone)}
            disabled={readOnly}
          />
        </Field>
        <Field label="Data de nascimento" htmlFor="birth_date">
          <Input id="birth_date" name="birth_date" type="date" defaultValue={patient.birth_date ?? ""} disabled={readOnly} />
        </Field>
        <Field label="CPF" htmlFor="cpf" hint="Opcional. Usado no recibo.">
          <Input id="cpf" name="cpf" inputMode="numeric" placeholder="000.000.000-00" defaultValue={formatCpf(patient.cpf)} disabled={readOnly} />
        </Field>
        <Field label="E-mail" htmlFor="email" hint="Opcional.">
          <Input id="email" name="email" type="email" inputMode="email" defaultValue={patient.email ?? ""} disabled={readOnly} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes" hint="Informações administrativas. O prontuário vem numa próxima etapa.">
        <Textarea id="notes" name="notes" rows={3} defaultValue={patient.notes ?? ""} disabled={readOnly} />
      </Field>
    </>
  );
}
