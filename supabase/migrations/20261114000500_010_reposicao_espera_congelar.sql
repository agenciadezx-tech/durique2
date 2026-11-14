-- Durique · Reposição com crédito, lista de espera, congelamento, regras da clínica e alunos em risco
create type public.credit_status as enum ('disponivel', 'usado', 'cancelado');
create type public.waitlist_status as enum ('aguardando', 'encaixado', 'cancelado');

-- ===== Regras da clínica =====
create table public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  cancel_notice_hours integer not null default 12 check (cancel_notice_hours between 0 and 72),
  makeup_validity_days integer not null default 30 check (makeup_validity_days between 1 and 365),
  updated_at timestamptz not null default now()
);
insert into public.clinic_settings (clinic_id) select id from public.clinics on conflict do nothing;

-- ===== Créditos de reposição =====
create table public.makeup_credits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  origin_attendee_id uuid not null unique,     -- a aula desmarcada no prazo
  origin_date date not null,
  expires_on date not null,
  status public.credit_status not null default 'disponivel',
  used_attendee_id uuid,                       -- a aula de reposição
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);
create index on public.makeup_credits (clinic_id, patient_id, status, expires_on);
create index on public.makeup_credits (used_attendee_id);

-- Desmarcou no prazo → ganha crédito. Voltou atrás → crédito cancelado (se não foi usado).
-- Entrou como reposição → usa o crédito mais antigo ainda válido.
create function private.handle_makeup_credit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_day date; v_days int; v_credit uuid;
begin
  if new.status::text = 'desmarcado_no_prazo' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select (a.starts_at at time zone 'America/Sao_Paulo')::date into v_day from public.appointments a where a.id = new.appointment_id;
    select coalesce(cs.makeup_validity_days, 30) into v_days from public.clinic_settings cs where cs.clinic_id = new.clinic_id;
    insert into public.makeup_credits (clinic_id, patient_id, origin_attendee_id, origin_date, expires_on)
    values (new.clinic_id, new.patient_id, new.id, v_day, v_day + coalesce(v_days, 30))
    on conflict (origin_attendee_id) do update set status = 'disponivel', used_attendee_id = null, used_at = null
      where public.makeup_credits.status = 'cancelado';
  elsif tg_op = 'UPDATE' and old.status::text = 'desmarcado_no_prazo' and new.status::text <> 'desmarcado_no_prazo' then
    update public.makeup_credits set status = 'cancelado'
     where origin_attendee_id = new.id and status = 'disponivel';
  end if;

  if tg_op = 'INSERT' and new.is_makeup then
    select c.id into v_credit from public.makeup_credits c
     where c.patient_id = new.patient_id and c.status = 'disponivel' and c.expires_on >= current_date
     order by c.expires_on limit 1 for update;
    if v_credit is not null then
      update public.makeup_credits set status = 'usado', used_attendee_id = new.id, used_at = now() where id = v_credit;
    end if;
  end if;
  return new;
end $$;
create trigger appointment_attendees_makeup
after insert or update of status on public.appointment_attendees
for each row execute function private.handle_makeup_credit();

-- Devolve o crédito quando a reposição é desfeita (chamado pelo app antes de tirar o paciente da aula)
create function public.release_makeup_credit(p_attendee uuid)
returns void language sql security invoker set search_path = ''
as $$
  update public.makeup_credits set status = 'disponivel', used_attendee_id = null, used_at = null
   where used_attendee_id = p_attendee and status = 'usado';
$$;

-- ===== Lista de espera =====
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,           -- uma aula específica
  series_id uuid,                -- ou uma vaga fixa num horário
  notes text,
  status public.waitlist_status not null default 'aguardando',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (appointment_id is not null or series_id is not null),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id) on delete cascade,
  foreign key (clinic_id, series_id) references public.recurring_series(clinic_id, id) on delete cascade
);
create index on public.waitlist (clinic_id, appointment_id, status);
create index on public.waitlist (clinic_id, series_id, status);
create index on public.waitlist (clinic_id, patient_id);

-- ===== Congelar pacote/plano =====
alter table public.patient_packages
  add column frozen_from date,
  add column frozen_until date,
  add constraint patient_packages_frozen_ck check (frozen_until is null or frozen_until >= frozen_from);

create function public.freeze_package(p_package uuid, p_from date, p_until date)
returns void language plpgsql security invoker set search_path = ''
as $$
declare p record; v_days int;
begin
  if p_until < p_from then raise exception 'A data final deve ser depois da inicial'; end if;
  v_days := p_until - p_from + 1;
  if v_days > 180 then raise exception 'Congelamento máximo de 180 dias'; end if;
  select * into p from public.patient_packages where id = p_package and status = 'ativo' for update;
  if not found then raise exception 'Pacote ou plano não encontrado'; end if;
  if p.frozen_until is not null and p.frozen_until >= current_date then raise exception 'Já está congelado até %', to_char(p.frozen_until, 'DD/MM/YYYY'); end if;
  update public.patient_packages
     set frozen_from = p_from, frozen_until = p_until,
         expires_on = case when expires_on is not null and kind = 'pacote' then expires_on + v_days else expires_on end
   where id = p_package;
end $$;

-- Mensalidades: não gera cobrança com vencimento dentro do congelamento
create or replace function public.ensure_plan_charges(p_clinic uuid)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare p record; v_due date; v_count int := 0; v_month date; v_last date;
begin
  if not private.has_role(p_clinic, 'admin', 'recepcao', 'financeiro') then return 0; end if;
  for p in select * from public.patient_packages
            where clinic_id = p_clinic and kind = 'plano' and status = 'ativo' and price_cents > 0 loop
    select max(due_date) into v_last from public.transactions where patient_package_id = p.id and installments is null;
    v_month := date_trunc('month', coalesce(v_last, p.starts_on))::date;
    loop
      v_month := (v_month + interval '1 month')::date;
      v_due := v_month + (coalesce(p.billing_day, 1) - 1);
      exit when v_due > (date_trunc('month', current_date) + interval '2 month' - interval '1 day')::date;
      exit when p.expires_on is not null and v_due > p.expires_on;
      continue when p.frozen_from is not null and v_due between p.frozen_from and p.frozen_until;
      insert into public.transactions
        (clinic_id, type, description, category_id, amount_cents, due_date, patient_id, patient_package_id)
      values
        (p.clinic_id, 'receita', p.name || ' · ' || to_char(v_due, 'MM/YYYY'),
         private.category_id(p.clinic_id, 'planos'), p.price_cents, v_due, p.patient_id, p.id)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;

-- ===== Alunos em risco (faltas seguidas ou sumidos) =====
create function public.patients_at_risk(p_clinic uuid)
returns table (patient_id uuid, name text, phone text, faltas_30d int, ultima_presenca date, motivo text)
language sql stable security invoker set search_path = ''
as $$
  with ativos as (
    select distinct p.id, p.name, p.phone
      from public.patients p
     where p.clinic_id = p_clinic and p.active
       and (exists (select 1 from public.enrollments e where e.patient_id = p.id and (e.ends_on is null or e.ends_on >= current_date))
         or exists (select 1 from public.patient_packages k where k.patient_id = p.id and k.status = 'ativo'
                     and (k.expires_on is null or k.expires_on >= current_date)))
  ), hist as (
    select t.patient_id,
           count(*) filter (where t.status = 'falta' and a.starts_at >= now() - interval '30 days')::int as faltas,
           max((a.starts_at at time zone 'America/Sao_Paulo')::date) filter (where t.status = 'presente') as ultima
      from public.appointment_attendees t
      join public.appointments a on a.id = t.appointment_id
     where t.clinic_id = p_clinic and a.starts_at < now() and a.status = 'agendado'
     group by t.patient_id
  )
  select a.id, a.name, a.phone, coalesce(h.faltas, 0), h.ultima,
         case when coalesce(h.faltas, 0) >= 2 then coalesce(h.faltas, 0) || ' faltas nos últimos 30 dias'
              else 'sem vir há ' || (current_date - h.ultima) || ' dias' end
    from ativos a
    left join hist h on h.patient_id = a.id
   where private.has_role(p_clinic, 'admin', 'recepcao')
     and (coalesce(h.faltas, 0) >= 2 or (h.ultima is not null and h.ultima < current_date - 21))
   order by coalesce(h.faltas, 0) desc, h.ultima nulls last
$$;

-- Novas clínicas já nascem com as regras padrão
create or replace function public.create_clinic(p_name text, p_unit_name text default 'Unidade principal')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'não autenticado';
  end if;
  insert into public.clinics (name) values (p_name) returning id into v_clinic;
  insert into public.units (clinic_id, name) values (v_clinic, p_unit_name);
  insert into public.members (clinic_id, user_id, role) values (v_clinic, (select auth.uid()), 'admin');
  perform private.seed_categories(v_clinic);
  insert into public.whatsapp_settings (clinic_id) values (v_clinic);
  perform private.seed_document_templates(v_clinic);
  insert into public.clinic_settings (clinic_id) values (v_clinic);
  return v_clinic;
end $$;

-- ===== Permissões =====
revoke execute on function private.handle_makeup_credit() from public, anon, authenticated;
revoke execute on function public.release_makeup_credit(uuid), public.freeze_package(uuid, date, date),
  public.patients_at_risk(uuid) from public, anon;
grant execute on function public.release_makeup_credit(uuid), public.freeze_package(uuid, date, date),
  public.patients_at_risk(uuid) to authenticated;

alter table public.clinic_settings enable row level security;
alter table public.makeup_credits enable row level security;
alter table public.waitlist enable row level security;

create policy clinic_settings_select on public.clinic_settings for select to authenticated using (private.is_member(clinic_id));
create policy clinic_settings_update on public.clinic_settings for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

create policy credits_select on public.makeup_credits for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy credits_update on public.makeup_credits for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));

create policy waitlist_select on public.waitlist for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy waitlist_insert on public.waitlist for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy waitlist_update on public.waitlist for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
