import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

export function buttonClass(variant: Variant = "primary", size: Size = "md", full = false) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none",
    "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    size === "lg" && "h-12 px-5 text-[15px]",
    size === "md" && "h-11 px-4 text-[15px]",
    size === "sm" && "h-9 px-3 text-sm",
    variant === "primary" && "bg-accent text-white hover:bg-accent-strong",
    variant === "secondary" && "bg-surface text-ink border border-line hover:bg-hover",
    variant === "ghost" && "text-ink hover:bg-hover",
    variant === "danger" && "bg-surface text-bad border border-line hover:bg-bad-soft",
    full && "w-full",
  );
}

export function LinkButton({
  href,
  variant,
  size,
  full,
  children,
  className,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size, full), className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">{title}</h1>
          {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
      </div>
    </header>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

const inputBase =
  "w-full h-12 rounded-xl border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-faint " +
  "transition-colors hover:border-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, "h-auto min-h-24 py-3", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        inputBase,
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%236b6b66%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_0.9rem_center] bg-no-repeat pr-10",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "info";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium",
        tone === "neutral" && "bg-hover text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "info" && "bg-info-soft text-info",
      )}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = "bad", children }: { tone?: "bad" | "ok" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx(
        "rounded-xl px-4 py-3 text-[15px]",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "info" && "bg-info-soft text-info",
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="mt-1 max-w-sm text-[15px] text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent",
        size === "md" ? "size-10 text-sm" : "size-8 text-xs",
      )}
    >
      {ini}
    </span>
  );
}

export function Section({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
