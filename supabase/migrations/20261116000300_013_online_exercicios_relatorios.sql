-- Durique · Agendamento online, exercícios para casa e relatórios

-- ===== Agendamento online =====
alter table public.clinics
  add column booking_slug text unique check (booking_slug ~ '^[a-z0-9-]{3,40}$'),
  add column booking_enabled boolean not null default false,
  add column booking_message text;
alter table public.services add column bookable boolean not null default false;
alter table public.appointment_attendees add column booked_online boolean not null default false;

-- Horários de atendimento de cada profissional (base dos horários livres)
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id) on delete cascade
);
create index on public.availability (clinic_id, professional_id, weekday);

alter table public.availability enable row level security;
create policy availability_select on public.availability for select to authenticated using (private.is_member(clinic_id));
create policy availability_insert on public.availability for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy availability_update on public.availability for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));
create policy availability_delete on public.availability for delete to authenticated using (private.has_role(clinic_id, 'admin'));

create function private.booking_clinic(p_slug text)
returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.clinics where booking_slug = p_slug and booking_enabled $$;

-- Dados da página pública
create function public.booking_info(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clinic', c.name,
    'message', c.booking_message,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind,
                   'duration', s.duration_min, 'price_cents', s.price_cents) order by s.name)
                from public.services s where s.clinic_id = c.id and s.active and s.bookable), '[]'::jsonb))
    from public.clinics c where c.id = private.booking_clinic(p_slug)
$$;

-- Horários livres de um serviço individual num dia (pela disponibilidade e agenda do profissional)
create function public.booking_slots(p_slug text, p_service uuid, p_day date)
returns table (professional_id uuid, professional_name text, starts_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); s record;
begin
  if v_clinic is null or p_day < current_date or p_day > current_date + 60 then return; end if;
  select * into s from public.services where id = p_service and clinic_id = v_clinic and active and bookable and kind = 'individual';
  if not found then return; end if;
  return query
  select pr.id, pr.name, slot
    from public.availability av
    join public.professionals pr on pr.id = av.professional_id and pr.active
    cross join lateral generate_series(
        (p_day + av.start_time) at time zone 'America/Sao_Paulo',
        (p_day + av.end_time) at time zone 'America/Sao_Paulo' - make_interval(mins => s.duration_min),
        make_interval(mins => greatest(s.duration_min, 30))) as slot
   where av.clinic_id = v_clinic and av.weekday = extract(isodow from p_day)
     and slot > now() + interval '2 hours'
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = pr.id and a.status = 'agendado'
          and a.starts_at < slot + make_interval(mins => s.duration_min) and a.ends_at > slot)
   order by slot, pr.name;
end $$;

-- Turmas com vaga (para aula experimental / serviço em turma)
create function public.booking_classes(p_slug text, p_service uuid)
returns table (appointment_id uuid, starts_at timestamptz, professional_name text, free int)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.starts_at, pr.name,
         (a.capacity - (select count(*) from public.appointment_attendees o where o.appointment_id = a.id
                         and o.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido')))::int
    from public.appointments a
    join public.services s on s.id = a.service_id and s.bookable and s.active
    join public.professionals pr on pr.id = a.professional_id
   where a.clinic_id = private.booking_clinic(p_slug) and a.service_id = p_service and a.status = 'agendado'
     and a.starts_at > now() + interval '2 hours' and a.starts_at < now() + interval '21 days'
     and a.capacity > (select count(*) from public.appointment_attendees o where o.appointment_id = a.id
                         and o.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido'))
   order by a.starts_at
$$;

create function private.booking_patient(p_clinic uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Informe seu nome completo'; end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Informe um WhatsApp válido com DDD'; end if;
  select id into v from public.patients where clinic_id = p_clinic and phone = p_phone order by active desc, created_at limit 1;
  if v is null then
    insert into public.patients (clinic_id, name, phone, notes) values (p_clinic, trim(p_name), p_phone, 'Cadastrado pelo agendamento online')
    returning id into v;
  end if;
  if (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
       where t.patient_id = v and t.booked_online and a.starts_at > now() and t.status::text in ('agendado', 'confirmado')) >= 3 then
    raise exception 'Você já tem horários marcados. Fale com a clínica para marcar mais.';
  end if;
  return v;
end $$;

create function public.booking_book(p_slug text, p_service uuid, p_professional uuid, p_starts_at timestamptz,
                                    p_name text, p_phone text)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); s record; v_patient uuid; v_appt uuid; v_unit uuid;
begin
  if v_clinic is null then raise exception 'Agendamento online indisponível'; end if;
  if not exists (select 1 from public.booking_slots(p_slug, p_service, (p_starts_at at time zone 'America/Sao_Paulo')::date) b
                  where b.professional_id = p_professional and b.starts_at = p_starts_at) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;
  select * into s from public.services where id = p_service;
  v_patient := private.booking_patient(v_clinic, p_name, p_phone);
  select id into v_unit from public.units where clinic_id = v_clinic and active order by created_at limit 1;
  insert into public.appointments (clinic_id, unit_id, service_id, professional_id, starts_at, ends_at, capacity, notes)
  values (v_clinic, v_unit, p_service, p_professional, p_starts_at, p_starts_at + make_interval(mins => s.duration_min), 1, 'Agendado online')
  returning id into v_appt;
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, booked_online)
  values (v_clinic, v_appt, v_patient, true);
  return p_starts_at;
end $$;

create function public.booking_book_class(p_slug text, p_appointment uuid, p_name text, p_phone text)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); v_patient uuid; v_start timestamptz;
begin
  if v_clinic is null then raise exception 'Agendamento online indisponível'; end if;
  select a.starts_at into v_start from public.appointments a join public.services s on s.id = a.service_id and s.bookable
   where a.id = p_appointment and a.clinic_id = v_clinic and a.status = 'agendado' and a.starts_at > now() + interval '2 hours';
  if v_start is null then raise exception 'Aula indisponível'; end if;
  v_patient := private.booking_patient(v_clinic, p_name, p_phone);
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, booked_online)
  values (v_clinic, p_appointment, v_patient, true);
  return v_start;
exception when unique_violation then raise exception 'Você já está nesta aula';
end $$;

-- ===== Exercícios para casa =====
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  video_url text,
  instructions text,
  region text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);

create table public.exercise_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  professional_id uuid,
  title text not null default 'Exercícios para casa',
  frequency text,                          -- ex.: "1x por dia", "3x por semana"
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);
create index on public.exercise_plans (clinic_id, patient_id, active);
create index on public.exercise_plans (clinic_id, professional_id);

create table public.exercise_plan_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  plan_id uuid not null,
  exercise_id uuid,
  sets text,                               -- ex.: "3 séries de 12"
  notes text,
  position int not null default 0,
  foreign key (clinic_id, plan_id) references public.exercise_plans(clinic_id, id) on delete cascade,
  foreign key (clinic_id, exercise_id) references public.exercises(clinic_id, id)
);
create index on public.exercise_plan_items (clinic_id, plan_id, position);
create index on public.exercise_plan_items (clinic_id, exercise_id);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  plan_id uuid not null,
  done_on date not null default current_date,
  pain smallint check (pain between 0 and 10),
  created_at timestamptz not null default now(),
  unique (plan_id, done_on),
  foreign key (clinic_id, plan_id) references public.exercise_plans(clinic_id, id) on delete cascade
);
create index on public.exercise_logs (clinic_id, plan_id);

alter table public.exercises enable row level security;
alter table public.exercise_plans enable row level security;
alter table public.exercise_plan_items enable row level security;
alter table public.exercise_logs enable row level security;

create policy exercises_select on public.exercises for select to authenticated using (private.has_role(clinic_id, 'admin', 'profissional'));
create policy exercises_insert on public.exercises for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'profissional'));
create policy exercises_update on public.exercises for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'profissional')) with check (private.has_role(clinic_id, 'admin', 'profissional'));

create policy plans_select on public.exercise_plans for select to authenticated using (private.can_see_clinical(clinic_id, patient_id));
create policy plans_insert on public.exercise_plans for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'profissional'));
create policy plans_update on public.exercise_plans for update to authenticated
  using (private.can_see_clinical(clinic_id, patient_id)) with check (private.can_see_clinical(clinic_id, patient_id));

create policy plan_items_select on public.exercise_plan_items for select to authenticated
  using (exists (select 1 from public.exercise_plans p where p.id = plan_id and private.can_see_clinical(p.clinic_id, p.patient_id)));
create policy plan_items_insert on public.exercise_plan_items for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'profissional'));
create policy plan_items_update on public.exercise_plan_items for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'profissional')) with check (private.has_role(clinic_id, 'admin', 'profissional'));
create policy plan_items_delete on public.exercise_plan_items for delete to authenticated
  using (private.has_role(clinic_id, 'admin', 'profissional'));

create policy exercise_logs_select on public.exercise_logs for select to authenticated
  using (exists (select 1 from public.exercise_plans p where p.id = plan_id and private.can_see_clinical(p.clinic_id, p.patient_id)));

-- Portal: exercícios ativos + "fiz hoje"
create or replace function public.portal_exercises(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.patients;
begin
  p := private.portal_patient(p_token);
  if p.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'plan_id', pl.id, 'title', pl.title, 'frequency', pl.frequency,
      'done_today', exists (select 1 from public.exercise_logs l where l.plan_id = pl.id and l.done_on = current_date),
      'days_7', (select count(*) from public.exercise_logs l where l.plan_id = pl.id and l.done_on > current_date - 7),
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'video_url', e.video_url,
                  'instructions', e.instructions, 'sets', i.sets, 'notes', i.notes) order by i.position)
                from public.exercise_plan_items i join public.exercises e on e.id = i.exercise_id
               where i.plan_id = pl.id), '[]'::jsonb)) order by pl.created_at desc)
      from public.exercise_plans pl where pl.patient_id = p.id and pl.active), '[]'::jsonb);
end $$;

create function public.portal_log_exercise(p_token text, p_plan uuid, p_pain smallint default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare p public.patients; v_clinic uuid;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  select clinic_id into v_clinic from public.exercise_plans where id = p_plan and patient_id = p.id and active;
  if v_clinic is null then raise exception 'Plano não encontrado'; end if;
  insert into public.exercise_logs (clinic_id, plan_id, pain) values (v_clinic, p_plan, p_pain)
  on conflict (plan_id, done_on) do update set pain = coalesce(excluded.pain, public.exercise_logs.pain);
end $$;

-- ===== Relatórios =====
create function public.report_overview(p_clinic uuid, p_months int default 6)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare v_from date := (date_trunc('month', current_date) - make_interval(months => greatest(1, least(p_months, 12)) - 1))::date;
begin
  if not private.has_role(p_clinic, 'admin', 'financeiro') then return null; end if;
  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'done', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                  where a.clinic_id = p_clinic and a.status = 'agendado' and t.status = 'presente'
                    and date_trunc('month', a.starts_at at time zone 'America/Sao_Paulo') = m),
        'missed', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                  where a.clinic_id = p_clinic and a.status = 'agendado' and t.status::text in ('falta', 'desmarcado_fora_prazo')
                    and date_trunc('month', a.starts_at at time zone 'America/Sao_Paulo') = m),
        'new_patients', (select count(*) from public.patients p where p.clinic_id = p_clinic
                    and date_trunc('month', p.created_at at time zone 'America/Sao_Paulo') = m),
        'revenue', (select coalesce(sum(amount_cents), 0) from public.transactions x where x.clinic_id = p_clinic
                    and x.type = 'receita' and x.paid_on is not null and date_trunc('month', x.paid_on) = m),
        'expenses', (select coalesce(sum(amount_cents), 0) from public.transactions x where x.clinic_id = p_clinic
                    and x.type = 'despesa' and x.paid_on is not null and date_trunc('month', x.paid_on) = m)
      ) order by m)
      from generate_series(v_from::timestamp, date_trunc('month', current_date)::timestamp, interval '1 month') m),
    'occupancy_30d', (
      select jsonb_build_object('taken', coalesce(sum(o.taken), 0), 'capacity', coalesce(sum(a.capacity), 0))
        from public.appointments a
        cross join lateral (select count(*) as taken from public.appointment_attendees t where t.appointment_id = a.id
                              and t.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido')) o
       where a.clinic_id = p_clinic and a.status = 'agendado' and a.capacity > 1
         and a.starts_at between now() - interval '30 days' and now()),
    'by_service_30d', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'done', q.n) order by q.n desc)
        from (select a.service_id, count(*) as n from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
               where a.clinic_id = p_clinic and t.status = 'presente' and a.starts_at > now() - interval '30 days'
               group by a.service_id) q join public.services s on s.id = q.service_id), '[]'::jsonb),
    'revenue_by_category_month', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(c.name, 'Sem categoria'), 'cents', q.total) order by q.total desc)
        from (select x.category_id, sum(x.amount_cents) as total from public.transactions x
               where x.clinic_id = p_clinic and x.type = 'receita' and x.paid_on >= date_trunc('month', current_date)
               group by x.category_id) q left join public.categories c on c.id = q.category_id), '[]'::jsonb),
    'active_patients', (select count(distinct t.patient_id) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                         where a.clinic_id = p_clinic and t.status = 'presente' and a.starts_at > now() - interval '30 days')
  );
end $$;

-- ===== Permissões =====
revoke execute on function private.booking_clinic(text), private.booking_patient(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.booking_info(text), public.booking_slots(text, uuid, date), public.booking_classes(text, uuid),
  public.booking_book(text, uuid, uuid, timestamptz, text, text), public.booking_book_class(text, uuid, text, text),
  public.portal_exercises(text), public.portal_log_exercise(text, uuid, smallint) from public;
grant execute on function public.booking_info(text), public.booking_slots(text, uuid, date), public.booking_classes(text, uuid),
  public.booking_book(text, uuid, uuid, timestamptz, text, text), public.booking_book_class(text, uuid, text, text),
  public.portal_exercises(text), public.portal_log_exercise(text, uuid, smallint) to anon, authenticated;
revoke execute on function public.report_overview(uuid, int) from public, anon;
grant execute on function public.report_overview(uuid, int) to authenticated;
