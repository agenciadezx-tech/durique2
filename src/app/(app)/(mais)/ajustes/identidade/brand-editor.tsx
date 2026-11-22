"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { brandPalette } from "@/lib/theme";
import { AtSign, CalendarPlus, ImagePlus, MessageCircle, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, buttonClass, cx, Field, Input, Textarea } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { saveBrand, setClinicImage } from "./actions";

const PALETTE = ["#0f766e", "#0d9488", "#2563eb", "#4f46e5", "#7c3aed", "#be185d", "#c2410c", "#b45309", "#4d7c0f", "#334155"];
const TABS = [
  { k: "pagina", label: "Página de agendamento" },
  { k: "app", label: "App do paciente" },
  { k: "documento", label: "Documento" },
  { k: "pre", label: "Pré-avaliação" },
] as const;

export type Brand = {
  clinicId: string;
  name: string;
  tagline: string;
  message: string;
  color: string;
  whatsapp: string;
  instagram: string;
  logo: string | null;
  banner: string | null;
  address: string;
  slug: string | null;
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Logo({ b, size = 44 }: { b: Brand; size?: number }) {
  return b.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logo} alt="" className="shrink-0 rounded-xl border border-line bg-white object-contain" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl font-bold text-white" style={{ width: size, height: size, background: b.color, fontSize: size * 0.36 }}>
      {initialsOf(b.name) || "?"}
    </span>
  );
}

/** Prévia do que o paciente vê, atualizada enquanto a pessoa edita. */
function Preview({ b, tab }: { b: Brand; tab: (typeof TABS)[number]["k"] }) {
  if (tab === "pagina")
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-bg">
        <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2 text-[11px] text-muted">
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="ml-2 truncate rounded-md bg-bg px-2 py-0.5">…/agendar/{b.slug ?? "sua-clinica"}</span>
        </div>
        <div className="h-20 bg-cover bg-center" style={b.banner ? { backgroundImage: `url(${b.banner})` } : { background: `linear-gradient(135deg, ${b.color}, ${b.color}cc)` }} />
        <div className="-mt-10 px-3 pb-4">
          <div className="rounded-xl border border-line bg-surface p-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Logo b={b} size={40} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.name || "Sua clínica"}</p>
                {b.tagline && <p className="truncate text-[12px] text-muted">{b.tagline}</p>}
              </div>
            </div>
            {b.message && <p className="mt-2 line-clamp-2 text-[12px] text-muted">{b.message}</p>}
            <div className="mt-2 flex gap-1.5">
              {b.whatsapp && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">WhatsApp</span>}
              {b.instagram && <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">@{b.instagram.replace(/^@/, "")}</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-hover p-1 text-center text-[12px] font-medium">
              <span className="rounded-md bg-surface py-1.5 shadow-sm">Quero agendar</span>
              <span className="py-1.5 text-muted">Já sou paciente</span>
            </div>
            <span className="mt-3 flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold text-white" style={{ background: b.color }}>
              Escolher horário →
            </span>
          </div>
        </div>
      </div>
    );
  if (tab === "app")
    return (
      <div className="overflow-hidden rounded-[28px] border-4 border-ink/80 bg-bg">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted">Boa tarde,</p>
            <span className="grid size-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: b.color }}>
              MO
            </span>
          </div>
          <p className="text-[19px] leading-tight font-semibold">Maria Oliveira</p>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5">
            <Logo b={b} size={24} />
            <span className="truncate text-[12px] font-medium">{b.name || "Sua clínica"}</span>
          </div>
        </div>
        <div className="space-y-2 px-4 pb-4">
          <div className="rounded-2xl p-3 text-white" style={{ background: b.color }}>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-85">Sua próxima sessão</p>
            <p className="mt-0.5 text-[17px] font-semibold">Amanhã · 15:00</p>
            <p className="text-[12px] opacity-90">Fisioterapia com Ana</p>
            <span className="mt-2 inline-flex rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold" style={{ color: b.color }}>
              Confirmar presença
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-surface p-2.5">
              <p className="text-[10px] font-semibold text-muted uppercase">Pacote 10 sessões</p>
              <p className="text-[18px] font-semibold">
                2 <span className="text-[11px] font-normal text-muted">restantes</span>
              </p>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-hover">
                <span className="block h-full w-4/5 rounded-full" style={{ background: b.color }} />
              </span>
            </div>
            <div className="rounded-xl border border-line bg-surface p-2.5">
              <p className="text-[10px] font-semibold text-muted uppercase">Pilates · mensal</p>
              <p className="text-[15px] font-semibold text-ok">Em dia</p>
              <p className="text-[11px] text-muted">ter e qui · 7h</p>
            </div>
          </div>
          <span className="flex h-10 items-center justify-center gap-1 rounded-xl text-[13px] font-semibold text-white" style={{ background: b.color }}>
            <CalendarPlus size={15} /> Agendar
          </span>
        </div>
        <div className="grid grid-cols-4 border-t border-line bg-surface py-2 text-center text-[10px] text-muted">
          <span style={{ color: b.color }}>Início</span>
          <span>Agenda</span>
          <span>Pagar</span>
          <span>Perfil</span>
        </div>
      </div>
    );
  if (tab === "documento")
    return (
      <div className="rounded-2xl border border-line bg-white p-5 text-ink shadow-sm">
        <div className="flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: b.color }}>
          <Logo b={b} size={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{b.name || "Sua clínica"}</p>
            <p className="truncate text-[11px] text-muted">{b.address || b.tagline || "Endereço da clínica"}</p>
          </div>
        </div>
        <p className="mt-4 text-center text-[13px] font-semibold tracking-wide uppercase">Termo de consentimento</p>
        <div className="mt-3 space-y-1.5">
          {[100, 92, 96, 70, 88, 60].map((w, i) => (
            <span key={i} className="block h-2 rounded bg-hover" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="mt-6 border-t border-dashed border-line pt-2 text-center text-[11px] text-muted">Assinatura do paciente</div>
      </div>
    );
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-bg">
      <div className="px-4 py-4 text-white" style={{ background: b.color }}>
        <div className="flex items-center gap-2">
          <Logo b={b} size={28} />
          <span className="truncate text-[13px] font-medium">{b.name || "Sua clínica"}</span>
        </div>
        <p className="mt-3 text-[18px] font-semibold">Pré-avaliação</p>
        <p className="text-[12px] opacity-90">Leva uns 3 minutos e adianta sua consulta.</p>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-[13px] font-medium">O que te trouxe aqui?</p>
        <span className="block h-14 rounded-lg border border-line bg-surface" />
        <p className="text-[13px] font-medium">Quanto dói agora? (0 a 10)</p>
        <div className="flex gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className="grid h-7 flex-1 place-items-center rounded-md border border-line bg-surface text-[10px]" style={i === 6 ? { background: b.color, color: "white" } : undefined}>
              {i}
            </span>
          ))}
        </div>
        <span className="mt-2 flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold text-white" style={{ background: b.color }}>
          Enviar
        </span>
      </div>
    </div>
  );
}

function Upload({ kind, b, onDone }: { kind: "logo" | "banner"; b: Brand; onDone: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const current = kind === "logo" ? b.logo : b.banner;

  async function send(file: File) {
    setErr(null);
    if (file.size > 2 * 1024 * 1024) return setErr("O arquivo passou de 2 MB. Use uma imagem menor.");
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return setErr("Use PNG, JPG, WebP ou SVG.");
    start(async () => {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${b.clinicId}/${kind}-${Date.now()}.${ext}`;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("clinic-assets").upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        console.error("upload", error.message);
        return setErr("Não foi possível enviar. Tente de novo.");
      }
      const url = supabase.storage.from("clinic-assets").getPublicUrl(path).data.publicUrl;
      const r = await setClinicImage(kind, url);
      if (r.error) return setErr(r.error);
      onDone(url);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {kind === "logo" ? (
          <Logo b={b} size={64} />
        ) : (
          <div
            className="grid h-24 w-full place-items-center rounded-xl border border-dashed border-line bg-hover bg-cover bg-center text-sm text-muted"
            style={current ? { backgroundImage: `url(${current})` } : undefined}
          >
            {!current && "Foto larga (ex.: 1600 × 600)"}
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) send(f);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={buttonClass("secondary", "sm")}>
          <ImagePlus size={16} /> {busy ? "Enviando…" : current ? "Trocar" : kind === "logo" ? "Enviar logo" : "Enviar foto"}
        </button>
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await setClinicImage(kind, null);
                if (r.error) setErr(r.error);
                else onDone(null);
              })
            }
            className={buttonClass("ghost", "sm")}
          >
            <Trash2 size={16} /> Tirar
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[13px] text-muted">
        {kind === "logo" ? "PNG, JPG, WebP ou SVG até 2 MB. Sem logo, aparecem as iniciais na cor da marca." : "Sem foto, a faixa fica na cor da marca."} Salva assim que envia.
      </p>
      {err && <p className="mt-1 text-sm text-bad">{err}</p>}
    </div>
  );
}

export function BrandEditor({ initial, canEdit }: { initial: Brand; canEdit: boolean }) {
  const [b, setB] = useState<Brand>(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("pagina");
  const set = (patch: Partial<Brand>) => setB((x) => ({ ...x, ...patch }));
  const custom = !PALETTE.includes(b.color);
  // Mostra a cor no app inteiro na hora (antes de salvar); ao sair sem salvar, volta a cor da clínica
  useEffect(() => {
    const p = brandPalette(b.color);
    const r = document.documentElement.style;
    r.setProperty("--color-accent", p.accent);
    r.setProperty("--color-accent-strong", p.strong);
    r.setProperty("--color-accent-soft", p.soft);
    return () => {
      r.removeProperty("--color-accent");
      r.removeProperty("--color-accent-strong");
      r.removeProperty("--color-accent-soft");
    };
  }, [b.color]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {!canEdit && <Alert tone="info">Somente o administrador altera a identidade da clínica.</Alert>}
        <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h2 className="text-[17px] font-semibold">Marca</h2>
            <p className="text-sm text-muted">A cara da clínica na página de agendamento, no app do paciente e nos documentos.</p>
          </div>
          {canEdit && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium">Logo</p>
                <Upload kind="logo" b={b} onDone={(url) => set({ logo: url })} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Foto de capa da página de agendamento</p>
                <Upload kind="banner" b={b} onDone={(url) => set({ banner: url })} />
              </div>
            </>
          )}
        </section>

        <ActionForm action={saveBrand} className="space-y-5 rounded-2xl border border-line bg-surface p-5">
          <fieldset>
            <legend className="mb-1 text-[14px] font-semibold text-accent">Cor da marca</legend>
            <p className="mb-2 text-[13px] text-muted">Pinta o app inteiro: menu, botões, abas e destaques, o app do paciente e a página de agendamento. Cores muito claras ficam um pouco mais escuras nos textos, para dar para ler.</p>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => set({ color: c })}
                  aria-label={`Cor ${c}`}
                  aria-pressed={b.color === c}
                  className={cx("size-10 rounded-xl ring-offset-2 transition", b.color === c && "ring-2 ring-ink")}
                  style={{ background: c }}
                />
              ))}
              <label className={cx("flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-2 text-sm", custom ? "border-ink" : "border-dashed border-line")}>
                <input type="color" value={b.color} disabled={!canEdit} onChange={(e) => set({ color: e.target.value })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Escolher outra cor" />
                Outra
              </label>
              <input type="hidden" name="color" value={b.color} />
              <span className="text-sm text-muted tabular-nums">{b.color}</span>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome que aparece">
              <Input name="name" value={b.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} required maxLength={80} />
            </Field>
            <Field label="Frase curta (opcional)">
              <Input name="tagline" value={b.tagline} onChange={(e) => set({ tagline: e.target.value })} disabled={!canEdit} maxLength={80} placeholder="Ex.: Fisioterapia e Pilates" />
            </Field>
          </div>
          <Field label="Texto de boas-vindas" hint="Aparece no topo da página de agendamento.">
            <Textarea
              name="message"
              rows={3}
              value={b.message}
              onChange={(e) => set({ message: e.target.value })}
              disabled={!canEdit}
              maxLength={300}
              placeholder="Ex.: Escolha o horário que fica melhor para você. Qualquer dúvida, chame no WhatsApp."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp da clínica">
              <div className="relative">
                <MessageCircle size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
                <Input name="whatsapp" type="tel" inputMode="tel" value={b.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} disabled={!canEdit} placeholder="(11) 99999-8888" className="pl-10" />
              </div>
            </Field>
            <Field label="Instagram">
              <div className="relative">
                <AtSign size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
                <Input name="instagram" value={b.instagram} onChange={(e) => set({ instagram: e.target.value })} disabled={!canEdit} placeholder="suaclinica" className="pl-10" />
              </div>
            </Field>
          </div>
          {canEdit && <SubmitButton size="md">Salvar identidade</SubmitButton>}
        </ActionForm>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-6">
        <p className="text-sm font-semibold">
          Prévia <span className="font-normal text-muted">· o que o paciente vê</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              aria-pressed={tab === t.k}
              className={cx("min-h-9 rounded-full border px-3 text-[13px] font-medium", tab === t.k ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Preview b={b} tab={tab} />
      </aside>
    </div>
  );
}
