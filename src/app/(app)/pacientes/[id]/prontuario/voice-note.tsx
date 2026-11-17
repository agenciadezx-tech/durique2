"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mic, Sparkles, Square } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { organizeNote, type OrganizedNote } from "./ai-actions";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/**
 * Ditado do prontuário: o profissional fala, o texto aparece, e a IA distribui nos campos.
 * O reconhecimento de voz é do próprio navegador (Chrome, Edge, Safari, Android).
 */
export function VoiceNote({ kind, aiOn, onFill, onPlain }: { kind: "avaliacao" | "evolucao"; aiOn: boolean; onFill: (n: OrganizedNote) => void; onPlain: (text: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else mid += res[0].transcript;
      }
      if (fin) setText((t) => (t ? `${t.trimEnd()} ${fin.trim()}` : fin.trim()));
      setInterim(mid);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") setMsg({ error: "Libere o microfone para este site (ícone ao lado do endereço)." });
    };
    r.onend = () => {
      setInterim("");
      if (want.current) {
        try {
          r.start(); // o navegador para sozinho depois de um silêncio; continua enquanto o botão estiver ligado
        } catch {
          /* já ligado */
        }
      } else setListening(false);
    };
    rec.current = r;
    return () => {
      want.current = false;
      r.stop();
    };
  }, []);

  function toggle() {
    if (!rec.current) return;
    setMsg(null);
    if (listening) {
      want.current = false;
      rec.current.stop();
      setListening(false);
    } else {
      want.current = true;
      try {
        rec.current.start();
      } catch {
        /* já ligado */
      }
      setListening(true);
    }
  }

  function organize() {
    if (listening) toggle();
    setMsg(null);
    start(async () => {
      const r = await organizeNote(kind, text);
      if (!r.ok) setMsg({ error: r.error });
      else {
        onFill(r.data);
        setMsg({ ok: "Pronto! Os campos abaixo foram preenchidos. Revise antes de salvar." });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Falar em vez de digitar</p>
          <p className="text-sm text-muted">
            {aiOn ? "Fale como foi o atendimento. A IA organiza nos campos certos e você revisa." : "Fale e o texto aparece aqui. Depois é só colocar no prontuário."}
          </p>
        </div>
        {supported !== false && (
          <button
            type="button"
            onClick={toggle}
            disabled={supported === null}
            className={cx(buttonClass(listening ? "danger" : "primary", "md"), listening && "animate-pulse")}
            aria-pressed={listening}
          >
            {listening ? <Square size={16} /> : <Mic size={18} />} {listening ? "Parar" : "Ditar"}
          </button>
        )}
      </div>
      {supported === false && <p className="mt-2 text-sm text-warn">Este navegador não aceita ditado. Use o Chrome ou o teclado do celular (ícone do microfone).</p>}
      {(text || interim || listening) && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text + (interim ? ` ${interim}` : "")}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            aria-label="Texto ditado"
            placeholder={listening ? "Pode falar…" : ""}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {aiOn ? (
              <button type="button" onClick={organize} disabled={pending || text.trim().length < 15} className={buttonClass("primary", "md")}>
                <Sparkles size={16} /> {pending ? "Organizando…" : "Organizar com IA"}
              </button>
            ) : (
              <button type="button" onClick={() => onPlain(text)} disabled={!text.trim()} className={buttonClass("primary", "md")}>
                Colocar no prontuário
              </button>
            )}
            <button type="button" onClick={() => setText("")} className={buttonClass("ghost", "md")}>
              Limpar
            </button>
          </div>
        </div>
      )}
      {msg?.error && <p className="mt-2 text-sm text-bad">{msg.error}</p>}
      {msg?.ok && <p className="mt-2 text-sm font-medium text-ok">{msg.ok}</p>}
    </div>
  );
}
