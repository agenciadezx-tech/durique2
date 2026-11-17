-- Durique · Assistente "Configurar clínica": tipo de clínica, horário de funcionamento, dados legais e andamento

alter table public.clinics
  add column practice_type text check (practice_type in ('fisio', 'aulas', 'ambos')),
  add column session_minutes smallint not null default 50 check (session_minutes between 10 and 240),
  add column cep text check (cep ~ '^[0-9]{8}$'),
  add column cnpj text check (cnpj ~ '^[0-9]{14}$'),
  add column legal_responsible text check (length(legal_responsible) <= 120),
  add column responsible_crefito text check (length(responsible_crefito) <= 30),
  add column setup_completed_at timestamptz,
  add column setup_dismissed boolean not null default false;

-- Horário de funcionamento da clínica (um período por dia da semana; dia sem linha = fechado)
create table public.clinic_hours (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  check (closes > opens),
  primary key (clinic_id, weekday)
);
alter table public.clinic_hours enable row level security;
create policy clinic_hours_select on public.clinic_hours for select to authenticated using (private.is_member(clinic_id));
create policy clinic_hours_insert on public.clinic_hours for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy clinic_hours_update on public.clinic_hours for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));
create policy clinic_hours_delete on public.clinic_hours for delete to authenticated using (private.has_role(clinic_id, 'admin'));

-- Clínicas que já usam o sistema não precisam ver o assistente
update public.clinics c set setup_completed_at = now()
 where exists (select 1 from public.patients p where p.clinic_id = c.id);
