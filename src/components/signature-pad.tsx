"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/** Campo para assinar com o dedo ou o mouse. Envia PNG (data URL) no input `name`. */
export function SignaturePad({ name = "signature_png", onChange }: { name?: string; onChange?: (empty: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState("");
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1d1d1b";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = canvas.current!.toDataURL("image/png");
    setData(url);
    onChange?.(false);
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setData("");
    onChange?.(true);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={data} />
      <div className="relative">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-line bg-surface"
          aria-label="Área para assinar"
        />
        {!data && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[15px] text-faint">Assine aqui com o dedo</span>
        )}
        <span className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-faint" aria-hidden />
      </div>
      <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Eraser size={16} /> Limpar e assinar de novo
      </button>
    </div>
  );
}
