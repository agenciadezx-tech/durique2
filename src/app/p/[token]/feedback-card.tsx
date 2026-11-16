"use client";

import { useState, useTransition } from "react";
import { Heart, Star } from "lucide-react";
import { buttonClass, Card, cx, Textarea } from "@/components/ui";
import { portalFeedback } from "./actions";

export function FeedbackCard({ token, clinic, reviewUrl }: { token: string; clinic: string; reviewUrl: string | null }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (hidden) return null;

  if (sent) {
    return (
      <Card className="bg-accent-soft p-5 text-center">
        <Heart size={28} className="mx-auto text-accent" />
        <p className="mt-2 font-semibold">Obrigado pela sua opinião!</p>
        {score != null && score >= 9 && reviewUrl ? (
          <>
            <p className="mt-1 text-[15px] text-muted">Que bom que você gosta! Pode contar isso no Google? Ajuda muito a clínica.</p>
            <a href={reviewUrl} target="_blank" rel="noreferrer" className={cx(buttonClass("primary", "md"), "mt-3")}>
              <Star size={18} /> Avaliar no Google
            </a>
          </>
        ) : (
          <p className="mt-1 text-[15px] text-muted">Sua resposta vai direto para a equipe da {clinic}.</p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="font-semibold">De 0 a 10, o quanto você indicaria a {clinic} para um amigo?</p>
      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score === n}
            onClick={() => setScore(n)}
            className={cx(
              "h-11 rounded-xl border font-semibold tabular-nums transition-colors",
              score === n ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>0 = não indicaria</span>
        <span>10 = com certeza</span>
      </div>
      {score != null && (
        <div className="mt-4 space-y-3">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            aria-label="Comentário"
            placeholder={score >= 9 ? "O que você mais gosta? (opcional)" : "O que podemos melhorar? (opcional)"}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await portalFeedback(token, score, comment);
                if (r.error) setError(r.error);
                else setSent(true);
              })
            }
            className={buttonClass("primary", "lg", true)}
          >
            {pending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      )}
      {score == null && (
        <button type="button" onClick={() => setHidden(true)} className="mt-2 min-h-11 text-sm text-muted hover:text-ink">
          Agora não
        </button>
      )}
    </Card>
  );
}
