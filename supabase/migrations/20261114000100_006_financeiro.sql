-- Durique · Pacotes, planos, financeiro e comissões
create type public.product_kind as enum ('pacote', 'plano');
create type public.package_status as enum ('ativo', 'encerrado', 'cancelado');
create type public.tx_type as enum ('receita', 'despesa');
create type public.pay_method as enum ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro');

-- ===== Comissão do profissional =====
alter table public.professionals
  add column commission_percent numeric(5,2) check (commission_percent between 0 and 100),
  add column commission_fixed_cents integer check (commission_fixed_cents >= 0),
  add constraint professionals_commission_ck check (commission_percent is null or commission_fixed_cents is null);

-- ===== Catálogo: pacotes e planos que a clínica vende =====
create table public.products (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind public.product_kind not null,
  service_id uuid,                       -- null = vale para qualquer serviço
  sessions integer check (sessions between 1 and 500),           -- pacote: nº de sessões
  validity_days integer check (validity_days between 1 and 1095),-- pacote: validade
  sessions_per_week integer check (sessions_per_week between 1 and 14), -- plano: frequência
  price_cents integer not null check (price_cents >= 0),         -- pacote: total · plano: mensalidade
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (kind <> 'pacote' or sessions is not null),
  check (kind <> 'plano' or sessions_per_week is not null),
  foreign key (clinic_id, service_id) references public.services(clinic_id, id)
);

-- ===== Pacote/plano vendido a um paciente =====
create table public.patient_packages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  product_id uuid,
  name text not null,
  kind public.product_kind not null,
  service_id uuid,
  total_sessions integer check (total_sessions >= 1),  -- null no plano (ilimitado dentro do mês)
  sessions_per_week integer,
  price_cents integer not null check (price_cents >= 0),
  billing_day smallint check (billing_day between 1 and 28), -- plano: dia da mensalidade
  starts_on date not null default current_date,
  expires_on date,                                   -- pacote: validade · plano: fim (se cancelado)
  status public.package_status not null default 'ativo',
  notes text,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (expires_on is null or expires_on >= starts_on - 1),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, product_id) references public.products(clinic_id, id) on delete set null (product_id),
  foreign key (clinic_id, service_id) references public.services(clinic_id, id)
);
create index on public.patient_packages (clinic_id, patient_id);
create index on public.patient_packages (clinic_id, product_id);
create index on public.patient_packages (clinic_id, service_id);

-- Sessão consumida de um pacote
alter table public.appointment_attendees add column package_id uuid,
  add constraint appointment_attendees_package_fk foreign key (clinic_id, package_id)
    references public.patient_packages(clinic_id, id) on delete set null (package_id);
create index on public.appointment_attendees (clinic_id, package_id);

-- ===== Categorias e lançamentos =====
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  type public.tx_type not null,
  name text not null,
  system_key text,           -- categorias usadas automaticamente pelo sistema
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, system_key)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  type public.tx_type not null,
  description text not null check (length(trim(description)) > 0),
  category_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  paid_on date,                         -- null = em aberto
  payment_method public.pay_method,
  patient_id uuid,
  patient_package_id uuid,
  professional_id uuid,                 -- repasse/comissão paga
  attendee_id uuid,                     -- sessão avulsa cobrada
  installment smallint,
  installments smallint,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, category_id) references public.categories(clinic_id, id) on delete set null (category_id),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, patient_package_id) references public.patient_packages(clinic_id, id) on delete set null (patient_package_id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);
create index on public.transactions (clinic_id, due_date);
create index on public.transactions (clinic_id, paid_on);
create index on public.transactions (clinic_id, category_id);
create index on public.transactions (clinic_id, patient_id);
create index on public.transactions (clinic_id, patient_package_id);
create index on public.transactions (clinic_id, professional_id);
create unique index transactions_plan_month_uq on public.transactions (patient_package_id, due_date)
  where patient_package_id is not null and installments is null; -- 1 mensalidade por mês por plano

-- ===== Categorias padrão =====
create function private.seed_categories(p_clinic uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.categories (clinic_id, type, name, system_key) values
    (p_clinic, 'receita', 'Pacotes e sessões', 'pacotes'),
    (p_clinic, 'receita', 'Planos mensais', 'planos'),
    (p_clinic, 'receita', 'Sessões avulsas', 'avulsas'),
    (p_clinic, 'receita', 'Outras receitas', null),
    (p_clinic, 'despesa', 'Aluguel', null),
    (p_clinic, 'despesa', 'Repasses e comissões', 'comissoes'),
    (p_clinic, 'despesa', 'Salários', null),
    (p_clinic, 'despesa', 'Contas (água, luz, internet)', null),
    (p_clinic, 'despesa', 'Materiais e equipamentos', null),
    (p_clinic, 'despesa', 'Impostos e taxas', null),
    (p_clinic, 'despesa', 'Marketing', null),
    (p_clinic, 'despesa', 'Outras despesas', null)
  on conflict do nothing;
$$;
revoke execute on function private.seed_categories(uuid) from public, anon, authenticated;
select private.seed_categories(id) from public.clinics;

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
  return v_clinic;
end $$;

create function private.category_id(p_clinic uuid, p_key text)
returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.categories where clinic_id = p_clinic and system_key = p_key $$;
grant execute on function private.category_id(uuid, text) to authenticated;

-- ===== Consumo automático de sessões do pacote =====
-- Veio, faltou ou desmarcou em cima da hora => usa uma sessão do pacote ativo do paciente.
create function private.assign_package()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_service uuid; v_day date; v_pkg uuid;
begin
  if new.status::text in ('presente', 'falta', 'desmarcado_fora_prazo') then
    if new.package_id is null then
      select a.service_id, (a.starts_at at time zone 'America/Sao_Paulo')::date
        into v_service, v_day from public.appointments a where a.id = new.appointment_id;
      select p.id into v_pkg
        from public.patient_packages p
       where p.patient_id = new.patient_id and p.status = 'ativo'
         and (p.service_id is null or p.service_id = v_service)
         and p.starts_on <= v_day and (p.expires_on is null or p.expires_on >= v_day)
         and (p.total_sessions is null or p.total_sessions > (
               select count(*) from public.appointment_attendees t
                where t.package_id = p.id and t.id <> new.id
                  and t.status::text in ('presente', 'falta', 'desmarcado_fora_prazo')))
       order by p.kind = 'plano' desc, p.expires_on nulls last, p.created_at
       limit 1;
      new.package_id := v_pkg;
    end if;
  else
    new.package_id := null; -- desfez a presença: devolve a sessão ao pacote
  end if;
  return new;
end $$;
create trigger appointment_attendees_package
before insert or update of status on public.appointment_attendees
for each row execute function private.assign_package();

-- Sessões usadas por pacote
create view public.package_usage with (security_invoker = true) as
select p.id as package_id,
       p.clinic_id,
       count(t.id) filter (where t.status::text in ('presente', 'falta', 'desmarcado_fora_prazo'))::int as used
  from public.patient_packages p
  left join public.appointment_attendees t on t.package_id = p.id
 group by p.id, p.clinic_id;

-- ===== Venda de pacote/plano (gera as parcelas) =====
create function public.sell_package(
  p_patient uuid, p_product uuid, p_price_cents integer, p_starts_on date,
  p_installments integer default 1, p_first_due date default current_date,
  p_paid_now boolean default false, p_method public.pay_method default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare pr record; v_pkg uuid; v_n int; v_each int; i int; v_amount int; v_due date;
begin
  select * into pr from public.products where id = p_product and active;
  if not found then raise exception 'Pacote ou plano não encontrado'; end if;
  if p_price_cents is null or p_price_cents < 0 then raise exception 'Valor inválido'; end if;

  insert into public.patient_packages
    (clinic_id, patient_id, product_id, name, kind, service_id, total_sessions, sessions_per_week,
     price_cents, billing_day, starts_on, expires_on)
  values
    (pr.clinic_id, p_patient, pr.id, pr.name, pr.kind, pr.service_id,
     case when pr.kind = 'pacote' then pr.sessions end, pr.sessions_per_week, p_price_cents,
     case when pr.kind = 'plano' then least(extract(day from p_first_due)::int, 28) end,
     p_starts_on,
     case when pr.kind = 'pacote' and pr.validity_days is not null then p_starts_on + pr.validity_days end)
  returning id into v_pkg;

  if p_price_cents > 0 then
    if pr.kind = 'pacote' then
      v_n := greatest(1, least(coalesce(p_installments, 1), 24));
      v_each := p_price_cents / v_n;
      for i in 1..v_n loop
        v_amount := case when i = v_n then p_price_cents - v_each * (v_n - 1) else v_each end;
        v_due := (p_first_due + make_interval(months => i - 1))::date;
        insert into public.transactions
          (clinic_id, type, description, category_id, amount_cents, due_date, paid_on, payment_method,
           patient_id, patient_package_id, installment, installments)
        values
          (pr.clinic_id, 'receita', pr.name || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
           private.category_id(pr.clinic_id, 'pacotes'), v_amount, v_due,
           case when i = 1 and p_paid_now then current_date end,
           case when i = 1 and p_paid_now then p_method end,
           p_patient, v_pkg, i, v_n);
      end loop;
    else
      -- plano: primeira mensalidade; as próximas são geradas por ensure_plan_charges
      insert into public.transactions
        (clinic_id, type, description, category_id, amount_cents, due_date, paid_on, payment_method,
         patient_id, patient_package_id)
      values
        (pr.clinic_id, 'receita', pr.name || ' · ' || to_char(p_first_due, 'MM/YYYY'),
         private.category_id(pr.clinic_id, 'planos'), p_price_cents, p_first_due,
         case when p_paid_now then current_date end, case when p_paid_now then p_method end,
         p_patient, v_pkg);
    end if;
  end if;
  return v_pkg;
end $$;

-- Mensalidades dos planos ativos até o próximo mês
create function public.ensure_plan_charges(p_clinic uuid)
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

-- ===== Comissões por profissional no período =====
-- Valor da sessão: pacote = preço / nº de sessões · plano = mensalidade / sessões previstas no mês
-- · sem pacote = preço do serviço. Só sessões em que o paciente veio geram comissão.
create function public.commission_report(p_clinic uuid, p_from date, p_to date)
returns table (professional_id uuid, professional_name text, sessions integer,
               base_cents bigint, commission_cents bigint, paid_cents bigint)
language sql stable security invoker set search_path = ''
as $$
  with s as (
    select a.professional_id,
           coalesce(
             case when pk.kind = 'pacote' then pk.price_cents::numeric / nullif(pk.total_sessions, 0) end,
             case when pk.kind = 'plano' then pk.price_cents::numeric / greatest(1, round(pk.sessions_per_week * 52 / 12.0)) end,
             sv.price_cents::numeric, 0) as value
      from public.appointment_attendees t
      join public.appointments a on a.id = t.appointment_id
      join public.services sv on sv.id = a.service_id
      left join public.patient_packages pk on pk.id = t.package_id
     where a.clinic_id = p_clinic and a.status = 'agendado' and t.status = 'presente'
       and (a.starts_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select pr.id, pr.name, count(s.*)::int,
         coalesce(round(sum(s.value)), 0)::bigint,
         coalesce(round(case when pr.commission_fixed_cents is not null then count(s.*) * pr.commission_fixed_cents
                             else sum(s.value) * coalesce(pr.commission_percent, 0) / 100 end), 0)::bigint,
         (select coalesce(sum(x.amount_cents), 0) from public.transactions x
           where x.clinic_id = p_clinic and x.professional_id = pr.id and x.type = 'despesa'
             and x.due_date between p_from and p_to)::bigint
    from public.professionals pr
    left join s on s.professional_id = pr.id
   where pr.clinic_id = p_clinic and private.has_role(p_clinic, 'admin', 'financeiro')
   group by pr.id, pr.name, pr.commission_fixed_cents, pr.commission_percent, pr.active
  having count(s.*) > 0 or pr.active
   order by pr.name
$$;

revoke execute on function public.sell_package(uuid, uuid, integer, date, integer, date, boolean, public.pay_method),
  public.ensure_plan_charges(uuid), public.commission_report(uuid, date, date) from public, anon;
grant execute on function public.sell_package(uuid, uuid, integer, date, integer, date, boolean, public.pay_method),
  public.ensure_plan_charges(uuid), public.commission_report(uuid, date, date) to authenticated;
revoke execute on function private.assign_package() from public, anon, authenticated;

-- ===== RLS =====
alter table public.products enable row level security;
alter table public.patient_packages enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy products_select on public.products for select to authenticated using (private.is_member(clinic_id));
create policy products_insert on public.products for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy products_update on public.products for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

create policy packages_select on public.patient_packages for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));
create policy packages_insert on public.patient_packages for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy packages_update on public.patient_packages for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));

create policy categories_select on public.categories for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));
create policy categories_insert on public.categories for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'financeiro'));
create policy categories_update on public.categories for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'financeiro')) with check (private.has_role(clinic_id, 'admin', 'financeiro'));

-- Lançamentos: admin/financeiro tudo; recepção só receitas (cobranças e caixa)
create policy transactions_select on public.transactions for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'financeiro')
         or (type = 'receita' and private.has_role(clinic_id, 'recepcao')));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'financeiro')
         or (type = 'receita' and private.has_role(clinic_id, 'recepcao')));
create policy transactions_update on public.transactions for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'financeiro')
         or (type = 'receita' and private.has_role(clinic_id, 'recepcao')))
  with check (private.has_role(clinic_id, 'admin', 'financeiro')
         or (type = 'receita' and private.has_role(clinic_id, 'recepcao')));
create policy transactions_delete on public.transactions for delete to authenticated
  using (private.has_role(clinic_id, 'admin', 'financeiro'));
