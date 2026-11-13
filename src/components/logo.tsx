export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-accent text-white" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 12c2.5-4 5-4 8 0s5.5 4 8 0" />
          <path d="M4 17c2.5-4 5-4 8 0s5.5 4 8 0" opacity="0.5" />
        </svg>
      </span>
      {!compact && <span className="text-[19px] font-semibold tracking-tight">Durique</span>}
    </span>
  );
}
