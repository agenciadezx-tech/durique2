-- Durique · Fase 1 · Multi-tenant (clínicas), equipe, pacientes, serviços
create type public.member_role as enum ('admin', 'recepcao', 'profissional', 'financeiro');
create type public.service_kind as enum ('individual', 'turma');

-- Clínicas (tenant)
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Unidades (modelo pronto para várias; UI do MVP mostra 1)
create table public.units (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);

-- Vínculo usuário <-> clínica com papel fixo
create table public.members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id),
  unique (clinic_id, id)
);

-- Profissionais (podem existir sem login; member_id liga ao usuário)
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  member_id uuid,
  name text not null,
  phone text,
  email text,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, member_id) references public.members(clinic_id, id) on delete set null (member_id)
);

-- Pacientes
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  birth_date date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, cpf)
);
comment on column public.patients.phone is 'Formato E.164, ex.: +5511999998888';
comment on column public.patients.cpf is 'Somente dígitos';

-- Serviços / tipos de atendimento
create table public.services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  kind public.service_kind not null,
  duration_min integer not null check (duration_min between 5 and 480),
  default_capacity integer not null default 1 check (default_capacity >= 1),
  price_cents integer check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (kind = 'turma' or default_capacity = 1)
);

create index on public.units (clinic_id);
create index on public.members (user_id);
create index on public.professionals (clinic_id);
create index on public.professionals (member_id);
create index on public.patients (clinic_id, name);
create index on public.services (clinic_id);

-- ===== Funções auxiliares de autorização =====
create function public.current_role_in(p_clinic uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.members m
  where m.clinic_id = p_clinic and m.user_id = (select auth.uid()) and m.active
$$;

create function public.is_member(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.current_role_in(p_clinic) is not null $$;

create function public.has_role(p_clinic uuid, variadic p_roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_role_in(p_clinic) = any(p_roles), false) $$;

create function public.my_professional_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.professionals p
  join public.members m on m.id = p.member_id
  where m.user_id = (select auth.uid()) and m.active
$$;

revoke execute on function public.current_role_in(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.member_role[]) from public, anon;
revoke execute on function public.my_professional_ids() from public, anon;
grant execute on function public.current_role_in(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function public.my_professional_ids() to authenticated;

-- Onboarding: cria clínica + unidade + o usuário atual como admin
create function public.create_clinic(p_name text, p_unit_name text default 'Unidade principal')
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
  return v_clinic;
end $$;
revoke execute on function public.create_clinic(text, text) from public, anon;
grant execute on function public.create_clinic(text, text) to authenticated;

-- ===== RLS =====
alter table public.clinics enable row level security;
alter table public.units enable row level security;
alter table public.members enable row level security;
alter table public.professionals enable row level security;
alter table public.patients enable row level security;
alter table public.services enable row level security;

-- clinics: criação só via create_clinic()
create policy clinics_select on public.clinics for select to authenticated using (public.is_member(id));
create policy clinics_update on public.clinics for update to authenticated
  using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));

-- units
create policy units_select on public.units for select to authenticated using (public.is_member(clinic_id));
create policy units_insert on public.units for insert to authenticated with check (public.has_role(clinic_id, 'admin'));
create policy units_update on public.units for update to authenticated
  using (public.has_role(clinic_id, 'admin')) with check (public.has_role(clinic_id, 'admin'));

-- members: todos da clínica veem a equipe; só admin gerencia
create policy members_select on public.members for select to authenticated using (public.is_member(clinic_id));
create policy members_insert on public.members for insert to authenticated with check (public.has_role(clinic_id, 'admin'));
create policy members_update on public.members for update to authenticated
  using (public.has_role(clinic_id, 'admin')) with check (public.has_role(clinic_id, 'admin'));
create policy members_delete on public.members for delete to authenticated
  using (public.has_role(clinic_id, 'admin') and user_id <> (select auth.uid()));

-- professionals
create policy professionals_select on public.professionals for select to authenticated using (public.is_member(clinic_id));
create policy professionals_insert on public.professionals for insert to authenticated with check (public.has_role(clinic_id, 'admin'));
create policy professionals_update on public.professionals for update to authenticated
  using (public.has_role(clinic_id, 'admin')) with check (public.has_role(clinic_id, 'admin'));

-- services
create policy services_select on public.services for select to authenticated using (public.is_member(clinic_id));
create policy services_insert on public.services for insert to authenticated with check (public.has_role(clinic_id, 'admin'));
create policy services_update on public.services for update to authenticated
  using (public.has_role(clinic_id, 'admin')) with check (public.has_role(clinic_id, 'admin'));

-- patients: política de leitura do profissional é criada na migração da agenda
create policy patients_select_staff on public.patients for select to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));
create policy patients_insert on public.patients for insert to authenticated
  with check (public.has_role(clinic_id, 'admin', 'recepcao'));
create policy patients_update on public.patients for update to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao')) with check (public.has_role(clinic_id, 'admin', 'recepcao'));
