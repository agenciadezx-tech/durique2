import { MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { whatsappLink } from "@/lib/format";

/** Abre o WhatsApp com o texto pronto. */
export function WaLink({ phone, text, label }: { phone: string; text: string; label: string }) {
  const base = whatsappLink(phone);
  if (!base) return null;
  const href = `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(text)}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
      <MessageCircle size={16} className="text-ok" /> {label}
    </a>
  );
}
