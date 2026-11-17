-- Durique · Resumo da semana escrito pela IA (guardado para não gerar de novo a cada visita)
create table public.ai_summaries (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null check (kind in ('semana')),
  period_start date not null,
  content jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (clinic_id, kind, period_start)
);
alter table public.ai_summaries enable row level security;
create policy ai_summaries_select on public.ai_summaries for select to authenticated using (private.has_role(clinic_id, 'admin', 'financeiro'));
create policy ai_summaries_insert on public.ai_summaries for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'financeiro'));
create policy ai_summaries_update on public.ai_summaries for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'financeiro')) with check (private.has_role(clinic_id, 'admin', 'financeiro'));
