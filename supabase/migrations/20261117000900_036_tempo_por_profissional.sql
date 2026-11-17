-- Tempo de cada atendimento por profissional (ex.: Ana faz Avaliação em 60 min, Carlos em 45).
-- Vazio = usa o tempo do serviço. Vale na agenda da clínica e no agendamento online.
create table public.professional_service_durations (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  service_id uuid not null,
  duration_min integer not null check (duration_min between 10 and 300),
  updated_at timestamptz not null default now(),
  primary key (professional_id, service_id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id) on delete cascade,
  foreign key (clinic_id, service_id) references public.services(clinic_id, id) on delete cascade
);
alter table public.professional_service_durations enable row level security;
create policy psd_select on public.professional_service_durations for select to authenticated
  using (private.is_member(clinic_id));
create policy psd_write on public.professional_service_durations for all to authenticated
  using (private.has_role(clinic_id, 'admin') or professional_id in (select private.my_professional_ids()))
  with check (private.has_role(clinic_id, 'admin') or professional_id in (select private.my_professional_ids()));

create or replace function private.duration_for(p_professional uuid, p_service uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select d.duration_min from public.professional_service_durations d where d.professional_id = p_professional and d.service_id = p_service),
    (select s.duration_min from public.services s where s.id = p_service),
    50)
$$;

create or replace function public.booking_slots(p_slug text, p_service uuid, p_day date)
returns table(professional_id uuid, professional_name text, starts_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); s record;
begin
  if v_clinic is null or p_day < current_date or p_day > current_date + 60 then return; end if;
  select * into s from public.services where id = p_service and clinic_id = v_clinic and active and bookable and kind = 'individual';
  if not found then return; end if;
  return query
  select distinct pr.id, pr.name, slot
    from public.availability av
    join public.professionals pr on pr.id = av.professional_id and pr.active
    cross join lateral (select private.duration_for(pr.id, s.id) as d) dur
    cross join lateral generate_series(
        (p_day + av.start_time) at time zone 'America/Sao_Paulo',
        (p_day + av.end_time) at time zone 'America/Sao_Paulo' - make_interval(mins => dur.d),
        make_interval(mins => greatest(dur.d, 30))) as slot
   where av.clinic_id = v_clinic and av.weekday = extract(isodow from p_day)
     and slot > now() + interval '2 hours'
     and not exists (
       select 1 from public.appointments a
        where a.professional_id = pr.id and a.status = 'agendado'
          and a.starts_at < slot + make_interval(mins => dur.d) and a.ends_at > slot)
     and not exists (
       select 1 from public.time_blocks b
        where b.clinic_id = v_clinic and (b.professional_id is null or b.professional_id = pr.id)
          and b.starts_at < slot + make_interval(mins => dur.d) and b.ends_at > slot)
   order by slot, pr.name;
end $$;

create or replace function public.booking_book(p_slug text, p_service uuid, p_professional uuid, p_starts_at timestamptz, p_name text, p_phone text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); v_patient uuid; v_appt uuid; v_unit uuid;
begin
  if v_clinic is null then raise exception 'Agendamento online indisponível'; end if;
  if not exists (select 1 from public.booking_slots(p_slug, p_service, (p_starts_at at time zone 'America/Sao_Paulo')::date) b
                  where b.professional_id = p_professional and b.starts_at = p_starts_at) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;
  v_patient := private.booking_patient(v_clinic, p_name, p_phone);
  select id into v_unit from public.units where clinic_id = v_clinic and active order by created_at limit 1;
  insert into public.appointments (clinic_id, unit_id, service_id, professional_id, starts_at, ends_at, capacity, notes)
  values (v_clinic, v_unit, p_service, p_professional, p_starts_at,
          p_starts_at + make_interval(mins => private.duration_for(p_professional, p_service)), 1, 'Agendado online')
  returning id into v_appt;
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, booked_online)
  values (v_clinic, v_appt, v_patient, true);
  return p_starts_at;
end $$;
