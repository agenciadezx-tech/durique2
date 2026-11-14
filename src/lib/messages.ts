/** Preenche um modelo de mensagem: "Olá, {nome}!" → "Olá, Maria!". Variável sem valor some. */
export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

/** Link que abre o WhatsApp (app ou web) já com a mensagem escrita. */
export function waSendLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export const TEMPLATE_VARS: Record<"lembrete" | "cobranca" | "renovacao", { key: string; label: string }[]> = {
  lembrete: [
    { key: "nome", label: "primeiro nome do paciente" },
    { key: "servico", label: "serviço" },
    { key: "dia", label: "dia (ex.: terça, 17/11)" },
    { key: "hora", label: "horário" },
    { key: "profissional", label: "profissional" },
    { key: "clinica", label: "nome da clínica" },
  ],
  cobranca: [
    { key: "nome", label: "primeiro nome" },
    { key: "descricao", label: "o que está sendo cobrado" },
    { key: "valor", label: "valor" },
    { key: "vencimento", label: "data de vencimento" },
    { key: "clinica", label: "nome da clínica" },
  ],
  renovacao: [
    { key: "nome", label: "primeiro nome" },
    { key: "restantes", label: "sessões restantes" },
    { key: "pacote", label: "nome do pacote" },
    { key: "validade", label: "data de validade" },
    { key: "clinica", label: "nome da clínica" },
  ],
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
