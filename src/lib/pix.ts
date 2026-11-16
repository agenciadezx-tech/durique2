/**
 * Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central) com valor.
 * Não depende de banco/gateway: o dinheiro cai direto na chave da clínica.
 */

export const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "telefone", label: "Celular" },
  { value: "email", label: "E-mail" },
  { value: "aleatoria", label: "Chave aleatória" },
] as const;

/** Normaliza a chave conforme o tipo; devolve null se inválida. */
export function normalizePixKey(type: string, raw: string): string | null {
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  switch (type) {
    case "cpf":
      return digits.length === 11 ? digits : null;
    case "cnpj":
      return digits.length === 14 ? digits : null;
    case "telefone": {
      const d = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 77 ? v.toLowerCase() : null;
    case "aleatoria":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
    default:
      return null;
  }
}

/** Remove acentos e caracteres fora do permitido pelo BR Code. */
function clean(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixConfig = { key: string; name: string; city?: string | null };

export function pixCode(cfg: PixConfig, amountCents: number, txid = "***") {
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", cfg.key);
  const ref = clean(txid, 25).replace(/[^A-Z0-9]/g, "") || "***";
  const payload =
    tlv("00", "01") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amountCents > 0 ? tlv("54", (amountCents / 100).toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", clean(cfg.name, 25) || "CLINICA") +
    tlv("60", clean(cfg.city || "BRASIL", 15) || "BRASIL") +
    tlv("62", tlv("05", ref)) +
    "6304";
  return payload + crc16(payload);
}

/** Texto para anexar na mensagem de cobrança. */
export function pixMessage(cfg: PixConfig | null, amountCents: number, txid?: string) {
  if (!cfg) return "";
  return `\n\nPix copia e cola (valor já incluído):\n${pixCode(cfg, amountCents, txid)}`;
}
