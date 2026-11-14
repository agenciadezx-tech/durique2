"use client";

import { useState, useTransition } from "react";
import { Check, MessageCircle } from "lucide-react";
import { logMessage } from "@/app/(app)/whatsapp/actions";
import { waSendLink } from "@/lib/messages";
import { buttonClass, cx } from "./ui";

/**
 * Abre o WhatsApp com a mensagem pronta e registra o envio.
 * Modo manual: quem envia é a pessoa, pelo WhatsApp da clínica.
 */
export function WaSendButton({
  phone,
  body,
  kind,
  patientId,
  attendeeId,
  transactionId,
  packageId,
  sentAt,
  label = "Enviar",
  compact,
}: {
  phone: string;
  body: string;
  kind: "lembrete" | "cobranca" | "renovacao" | "outro";
  patientId: string;
  attendeeId?: string;
  transactionId?: string;
  packageId?: string;
  sentAt?: string | null;
  label?: string;
  compact?: boolean;
}) {
  const [sent, setSent] = useState<string | null>(sentAt ?? null);
  const [, start] = useTransition();

  function send() {
    window.open(waSendLink(phone, body), "_blank", "noopener");
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("patient_id", patientId);
    fd.set("phone", phone);
    fd.set("body", body);
    if (attendeeId) fd.set("attendee_id", attendeeId);
    if (transactionId) fd.set("transaction_id", transactionId);
    if (packageId) fd.set("package_id", packageId);
    setSent(new Date().toISOString());
    start(async () => {
      await logMessage(fd);
    });
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={send}
        aria-label={sent ? "Enviar de novo pelo WhatsApp" : "Enviar pelo WhatsApp"}
        title={sent ? "Já enviado. Enviar de novo?" : "Enviar pelo WhatsApp"}
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
          sent ? "text-ok hover:bg-ok-soft" : "text-muted hover:bg-hover hover:text-ok",
        )}
      >
        {sent ? <Check size={20} /> : <MessageCircle size={20} />}
      </button>
    );
  }
  return (
    <button type="button" onClick={send} className={cx(buttonClass(sent ? "secondary" : "primary", "sm"), "min-w-28")}>
      {sent ? (
        <>
          <Check size={16} className="text-ok" /> Enviado
        </>
      ) : (
        <>
          <MessageCircle size={16} /> {label}
        </>
      )}
    </button>
  );
}
