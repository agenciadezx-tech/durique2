-- Catálogo por serviço: regras de falta/aviso/remarcação/reposição, pós-pago, descontos, ciclos de plano e salas.
-- Padrões = comportamento de antes (nada muda para quem não mexer).

alter table public.services
  add column if not exists booking_trial boolean not null default false,          -- experimental pelo link (1x por pessoa)
  add column if not exists start_mode text not null default 'meia' check (start_mode in ('sequencia', 'meia')),
  add column if not exists rules_reviewed boolean not null default false,
  add column if not exists early_eve boolean not null default false,              -- aula antes das 10h: prazo = véspera 20h
  add column if not exists self_cancel boolean not null default true,
  add column if not exists self_reschedule boolean not null default false,
  add column if not exists reschedule_max_month integer not null default 0 check (reschedule_max_month >= 0),
  add column if not exists late_reschedule text not null default 'falta' check (late_reschedule in ('falta', 'bloqueia', 'deixa')),
  add column if not exists noshow_rule text not null default 'perde_sem_comissao' check (noshow_rule in ('perde_comissao', 'so_falta', 'perde_sem_comissao')),
  add column if not exists notice_rule text not null default 'credito' check (notice_rule in ('credito', 'perde', 'nao_perde')),
  add column if not exists makeup_days integer check (makeup_days between 1 and 365),
  add column if not exists makeup_max_month integer not null default 0 check (makeup_max_month >= 0),
  add column if not exists requires_evolution boolean not null default false,
  add column if not exists postpaid boolean not null default false,
  add column if not exists family_discount_pct numeric(5,2) check (family_discount_pct between 0 and 100),
  add column if not exists punctual_discount_pct numeric(5,2) check (punctual_discount_pct between 0 and 100);

alter table public.products
  add column if not exists cycle_months smallint not null default 1 check (cycle_months in (1, 3, 6, 12)),
  add column if not exists format text not null default 'grupo' check (format in ('grupo', 'individual')),
  add column if not exists classes_per_month smallint check (classes_per_month between 1 and 60);
alter table public.patient_packages
  add column if not exists cycle_months smallint not null default 1 check (cycle_months in (1, 3, 6, 12));

-- Remarcação pelo link: de qual presença veio
alter table public.appointment_attendees add column if not exists rescheduled_from uuid;

-- Salas
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  capacity integer check (capacity between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);
alter table public.rooms enable row level security;
create policy rooms_select on public.rooms for select using (private.is_member(clinic_id));
create policy rooms_write on public.rooms for all
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
alter table public.recurring_series add column if not exists room_id uuid;
do $$ begin
  alter table public.recurring_series add constraint recurring_series_room_fk
    foreign key (clinic_id, room_id) references public.rooms(clinic_id, id) on delete set null (room_id);
exception when duplicate_object then null; end $$;
create index if not exists recurring_series_room_idx on public.recurring_series (clinic_id, room_id);

-- ===== Consumo do pacote segue a regra do serviço =====
create or replace function private.assign_package()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_service uuid; v_day date; v_pkg uuid; sv record; v_consume boolean;
begin
  if new.charge_kind is not null then
    new.package_id := null;
    return new;
  end if;
  select a.service_id, (a.starts_at at time zone 'America/Sao_Paulo')::date into v_service, v_day
    from public.appointments a where a.id = new.appointment_id;
  select noshow_rule, notice_rule into sv from public.services where id = v_service;
  v_consume := case new.status::text
    when 'presente' then true
    when 'falta' then coalesce(sv.noshow_rule, 'perde_sem_comissao') <> 'so_falta'
    when 'desmarcado_fora_prazo' then coalesce(sv.noshow_rule, 'perde_sem_comissao') <> 'so_falta'
    when 'desmarcado_no_prazo' then coalesce(sv.notice_rule, 'credito') = 'perde'
      and not exists (select 1 from public.appointment_attendees r where r.rescheduled_from = new.id)
    else false end;
  if v_consume then
    if new.package_id is null then
      select p.id into v_pkg
        from public.patient_packages p
       where p.patient_id = new.patient_id and p.status = 'ativo'
         and (p.service_id is null or p.service_id = v_service)
         and p.starts_on <= v_day and (p.expires_on is null or p.expires_on >= v_day)
         and (p.total_sessions is null or p.total_sessions > (
               select count(*) from public.appointment_attendees t
                where t.package_id = p.id and t.id <> new.id))
       order by p.kind = 'plano' desc, p.expires_on nulls last, p.created_at
       limit 1;
      new.package_id := v_pkg;
    end if;
  else
    new.package_id := null;
  end if;
  return new;
end $$;
revoke execute on function private.assign_package() from public, anon, authenticated;

-- Uso = presenças que consumiram (package_id preenchido só quando consome)
create or replace view public.package_usage with (security_invoker = true) as
  select p.id as package_id, p.clinic_id, (count(t.id))::integer as used
    from public.patient_packages p
    left join public.appointment_attendees t on t.package_id = p.id
   group by p.id, p.clinic_id;

-- ===== Crédito de reposição segue a regra do serviço =====
create or replace function private.handle_makeup_credit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_day date; v_days int; v_credit uuid; v_rule text; v_mdays int;
begin
  if new.status::text = 'desmarcado_no_prazo' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select (a.starts_at at time zone 'America/Sao_Paulo')::date, s.notice_rule, s.makeup_days into v_day, v_rule, v_mdays
      from public.appointments a join public.services s on s.id = a.service_id where a.id = new.appointment_id;
    if coalesce(v_rule, 'credito') = 'credito'
       and not exists (select 1 from public.appointment_attendees r where r.rescheduled_from = new.id) then
      select coalesce(v_mdays, cs.makeup_validity_days, 30) into v_days from public.clinic_settings cs where cs.clinic_id = new.clinic_id;
      insert into public.makeup_credits (clinic_id, patient_id, origin_attendee_id, origin_date, expires_on)
      values (new.clinic_id, new.patient_id, new.id, v_day, v_day + coalesce(v_days, v_mdays, 30))
      on conflict (origin_attendee_id) do update set status = 'disponivel', used_attendee_id = null, used_at = null
        where public.makeup_credits.status = 'cancelado';
    end if;
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

-- ===== Comissão: falta paga comissão quando o serviço manda =====
create or replace function public.commission_report(p_clinic uuid, p_from date, p_to date)
 returns table(professional_id uuid, professional_name text, sessions integer, base_cents bigint, commission_cents bigint, paid_cents bigint)
 language sql stable set search_path to ''
as $function$
  with s as (
    select a.professional_id,
           coalesce(
             case when pk.kind = 'pacote' then pk.price_cents::numeric / nullif(pk.total_sessions, 0) end,
             case when pk.kind = 'plano' then pk.price_cents::numeric / greatest(1, round(pk.sessions_per_week * 52 / 12.0)) end,
             (select sum(x.amount_cents) from public.transactions x where x.attendee_id = t.id and x.type = 'receita')::numeric,
             case when t.charge_kind = 'experimental' then 0 end,
             sv.price_cents::numeric, 0) as value
      from public.appointment_attendees t
      join public.appointments a on a.id = t.appointment_id
      join public.services sv on sv.id = a.service_id
      left join public.patient_packages pk on pk.id = t.package_id
     where a.clinic_id = p_clinic and a.status = 'agendado'
       and (t.status = 'presente'
            or (t.status::text in ('falta', 'desmarcado_fora_prazo') and sv.noshow_rule = 'perde_comissao'))
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
$function$;

-- ===== Prazo para desmarcar (com "aula cedo: véspera") =====
create or replace function private.cancel_deadline(p_appointment uuid)
returns timestamptz language sql stable security definer set search_path = ''
as $$
  select case
    when s.early_eve and (a.starts_at at time zone 'America/Sao_Paulo')::time < time '10:00'
      then (((a.starts_at at time zone 'America/Sao_Paulo')::date - 1) + time '20:00') at time zone 'America/Sao_Paulo'
    else a.starts_at - make_interval(hours => coalesce(s.cancel_notice_hours, cs.cancel_notice_hours, 12))
  end
  from public.appointments a
  join public.services s on s.id = a.service_id
  left join public.clinic_settings cs on cs.clinic_id = a.clinic_id
  where a.id = p_appointment
$$;
revoke execute on function private.cancel_deadline(uuid) from public, anon;
grant execute on function private.cancel_deadline(uuid) to authenticated;

create or replace function public.portal_cancel(p_token text, p_attendee uuid)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare p public.patients; v_start timestamptz; v_appt uuid; v_status text; v_self boolean;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  select a.starts_at, a.id, s.self_cancel into v_start, v_appt, v_self
    from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id join public.services s on s.id = a.service_id
   where t.id = p_attendee and t.patient_id = p.id and t.status in ('agendado', 'confirmado') and a.starts_at > now();
  if v_start is null then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  if not coalesce(v_self, true) then raise exception 'Para desmarcar, fale com a recepção da clínica'; end if;
  v_status := case when now() <= private.cancel_deadline(v_appt) then 'desmarcado_no_prazo' else 'desmarcado_fora_prazo' end;
  update public.appointment_attendees set status = v_status::public.attendee_status where id = p_attendee;
  return v_status;
end $function$;

-- ===== Remarcar sozinho pelo link =====
create or replace function public.portal_reschedule(p_token text, p_attendee uuid, p_appointment uuid)
 returns timestamptz language plpgsql security definer set search_path to ''
as $function$
declare p public.patients; t record; target record; v_used int; v_late boolean;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  select x.id, x.status, a.id as appt, a.service_id, a.starts_at, s.self_reschedule, s.reschedule_max_month, s.late_reschedule
    into t
    from public.appointment_attendees x join public.appointments a on a.id = x.appointment_id join public.services s on s.id = a.service_id
   where x.id = p_attendee and x.patient_id = p.id and x.status in ('agendado', 'confirmado') and a.starts_at > now();
  if t.id is null then raise exception 'Esta aula não pode mais ser remarcada'; end if;
  if not t.self_reschedule then raise exception 'Para remarcar, fale com a recepção da clínica'; end if;
  v_late := now() > private.cancel_deadline(t.appt);
  if v_late and t.late_reschedule <> 'deixa' then
    raise exception 'Passou do prazo para remarcar. Se não puder vir, avise a clínica.';
  end if;
  if t.reschedule_max_month > 0 then
    select count(*) into v_used from public.appointment_attendees r
     where r.patient_id = p.id and r.rescheduled_from is not null
       and date_trunc('month', r.created_at) = date_trunc('month', now());
    if v_used >= t.reschedule_max_month then raise exception 'Você já remarcou o máximo deste mês'; end if;
  end if;
  select * into target from public.appointments
   where id = p_appointment and clinic_id = p.clinic_id and status = 'agendado' and service_id = t.service_id
     and starts_at > now() + interval '2 hours';
  if not found then raise exception 'Este horário não está disponível'; end if;
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, rescheduled_from)
  values (p.clinic_id, p_appointment, p.id, t.id)
  on conflict (appointment_id, patient_id) do update set status = 'agendado', rescheduled_from = excluded.rescheduled_from
    where public.appointment_attendees.status::text in ('removido', 'desmarcado_no_prazo', 'desmarcado_fora_prazo');
  update public.appointment_attendees set status = 'desmarcado_no_prazo' where id = t.id;
  return target.starts_at;
exception when unique_violation then raise exception 'Você já está nesse horário';
end $function$;
revoke execute on function public.portal_reschedule(text, uuid, uuid) from public;
grant execute on function public.portal_reschedule(text, uuid, uuid) to anon, authenticated;

-- ===== Mensalidade com ciclo (tri/sem/anual cobrado adiantado) =====
create or replace function public.sell_package(p_patient uuid, p_product uuid, p_price_cents integer, p_starts_on date, p_installments integer default 1, p_first_due date default current_date, p_paid_now boolean default false, p_method pay_method default null::pay_method)
 returns uuid language plpgsql set search_path to ''
as $function$
declare pr record; v_pkg uuid; v_n int; v_each int; i int; v_amount int; v_due date; v_cycle int;
begin
  select * into pr from public.products where id = p_product and active;
  if not found then raise exception 'Pacote ou plano não encontrado'; end if;
  if p_price_cents is null or p_price_cents < 0 then raise exception 'Valor inválido'; end if;
  v_cycle := case when pr.kind = 'plano' then coalesce(pr.cycle_months, 1) else 1 end;

  insert into public.patient_packages
    (clinic_id, patient_id, product_id, name, kind, service_id, total_sessions, sessions_per_week,
     price_cents, billing_day, starts_on, expires_on, cycle_months)
  values
    (pr.clinic_id, p_patient, pr.id, pr.name, pr.kind, pr.service_id,
     case when pr.kind = 'pacote' then pr.sessions end, pr.sessions_per_week, p_price_cents,
     case when pr.kind = 'plano' then least(extract(day from p_first_due)::int, 28) end,
     p_starts_on,
     case when pr.kind = 'pacote' and pr.validity_days is not null then p_starts_on + pr.validity_days end,
     v_cycle)
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
      insert into public.transactions
        (clinic_id, type, description, category_id, amount_cents, due_date, paid_on, payment_method,
         patient_id, patient_package_id)
      values
        (pr.clinic_id, 'receita',
         pr.name || ' · ' || to_char(p_first_due, 'MM/YYYY') || case v_cycle when 3 then ' (trimestral)' when 6 then ' (semestral)' when 12 then ' (anual)' else '' end,
         private.category_id(pr.clinic_id, 'planos'), p_price_cents * v_cycle, p_first_due,
         case when p_paid_now then current_date end, case when p_paid_now then p_method end,
         p_patient, v_pkg);
    end if;
  end if;
  return v_pkg;
end $function$;

create or replace function public.ensure_plan_charges(p_clinic uuid)
 returns integer language plpgsql set search_path to ''
as $function$
declare p record; v_due date; v_count int := 0; v_month date; v_last date; v_cycle int;
begin
  if not private.has_role(p_clinic, 'admin', 'recepcao', 'financeiro') then return 0; end if;
  for p in select * from public.patient_packages
            where clinic_id = p_clinic and kind = 'plano' and status = 'ativo' and price_cents > 0 loop
    v_cycle := coalesce(p.cycle_months, 1);
    select max(due_date) into v_last from public.transactions where patient_package_id = p.id and installments is null;
    v_month := date_trunc('month', coalesce(v_last, p.starts_on))::date;
    loop
      v_month := (v_month + make_interval(months => v_cycle))::date;
      v_due := v_month + (coalesce(p.billing_day, 1) - 1);
      exit when v_due > (date_trunc('month', current_date) + interval '2 month' - interval '1 day')::date;
      exit when p.expires_on is not null and v_due > p.expires_on;
      continue when p.frozen_from is not null and v_due between p.frozen_from and p.frozen_until;
      insert into public.transactions
        (clinic_id, type, description, category_id, amount_cents, due_date, patient_id, patient_package_id)
      values
        (p.clinic_id, 'receita',
         p.name || ' · ' || to_char(v_due, 'MM/YYYY') || case v_cycle when 3 then ' (trimestral)' when 6 then ' (semestral)' when 12 then ' (anual)' else '' end,
         private.category_id(p.clinic_id, 'planos'), p.price_cents * v_cycle, v_due, p.patient_id, p.id)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $function$;

-- ===== Pós-pago: quem veio sem pacote gera a cobrança da aula para o fim do mês =====
create or replace function private.postpaid_charge()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sv record; v_day date;
begin
  if new.status::text = 'presente' and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.package_id is null and new.charge_kind is null then
    select s.postpaid, s.price_cents, s.name, (a.starts_at at time zone 'America/Sao_Paulo')::date as d
      into sv from public.appointments a join public.services s on s.id = a.service_id where a.id = new.appointment_id;
    if sv.postpaid and coalesce(sv.price_cents, 0) > 0
       and not exists (select 1 from public.transactions x where x.attendee_id = new.id) then
      insert into public.transactions (clinic_id, type, description, category_id, amount_cents, due_date, patient_id, attendee_id)
      values (new.clinic_id, 'receita', sv.name || ' · ' || to_char(sv.d, 'DD/MM') || ' (pós-pago)',
              private.category_id(new.clinic_id, 'avulsas'), sv.price_cents,
              (date_trunc('month', sv.d) + interval '1 month' - interval '1 day')::date, new.patient_id, new.id);
    end if;
  elsif tg_op = 'UPDATE' and old.status::text = 'presente' and new.status::text <> 'presente' then
    delete from public.transactions x where x.attendee_id = new.id and x.paid_on is null and x.description like '%(pós-pago)';
  end if;
  return null;
end $$;
revoke execute on function private.postpaid_charge() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'appointment_attendees_postpaid') then
    create trigger appointment_attendees_postpaid after insert or update of status on public.appointment_attendees
    for each row execute function private.postpaid_charge();
  end if;
end $$;

-- ===== Experimental pelo link: 1ª aula de quem nunca veio =====
create or replace function public.booking_book_class(p_slug text, p_appointment uuid, p_name text, p_phone text)
 returns timestamp with time zone language plpgsql security definer set search_path to ''
as $function$
declare v_clinic uuid := private.booking_clinic(p_slug); v_patient uuid; v_start timestamptz; v_trial boolean;
begin
  if v_clinic is null then raise exception 'Agendamento online indisponível'; end if;
  select a.starts_at, s.booking_trial into v_start, v_trial from public.appointments a join public.services s on s.id = a.service_id and s.bookable
   where a.id = p_appointment and a.clinic_id = v_clinic and a.status = 'agendado' and a.starts_at > now() + interval '2 hours';
  if v_start is null then raise exception 'Aula indisponível'; end if;
  v_patient := private.booking_patient(v_clinic, p_name, p_phone);
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, booked_online, charge_kind)
  values (v_clinic, p_appointment, v_patient, true,
          case when v_trial and not exists (select 1 from public.appointment_attendees o where o.patient_id = v_patient) then 'experimental' end);
  return v_start;
exception when unique_violation then raise exception 'Você já está nesta aula';
end $function$;

-- ===== Painel do aluno: prazo, desmarcar/remarcar sozinho e uso do pacote =====
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.portal_get'::regproc);
  d := replace(d, $q$'notice_hours', coalesce(s.cancel_notice_hours, v_notice, 12))$q$,
    $q$'notice_hours', coalesce(s.cancel_notice_hours, v_notice, 12),
               'service_id', s.id, 'deadline', private.cancel_deadline(a.id),
               'can_cancel', s.self_cancel, 'can_reschedule', s.self_reschedule)$q$);
  d := replace(d, $q$jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'service', s.name,$q$,
    $q$jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'service', s.name, 'service_id', s.id,$q$);
  d := replace(d, $q$where u.package_id = k.id and u.status::text in ('presente', 'falta', 'desmarcado_fora_prazo'))$q$,
    $q$where u.package_id = k.id)$q$);
  execute d;
end $do$;
