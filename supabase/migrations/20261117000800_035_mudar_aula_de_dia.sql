-- Mudar uma sessão de dia/horário sem que a agenda recrie a original.
-- slot_at = horário "de origem" da turma fixa; a geração automática usa ele para saber que a sessão já existe.
alter table public.appointments add column if not exists slot_at timestamptz;
update public.appointments set slot_at = starts_at where series_id is not null and slot_at is null;
drop index if exists public.appointments_series_start_uq;
create unique index appointments_series_slot_uq on public.appointments (series_id, slot_at) where series_id is not null;

create or replace function public.generate_series_occurrences(p_series uuid, p_until date)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  s record; v_tz text; d date; v_start timestamptz; v_appt uuid; v_count integer := 0;
begin
  select * into s from public.recurring_series where id = p_series and active;
  if not found then raise exception 'Horário recorrente não encontrado ou inativo'; end if;
  if p_until > current_date + 180 then raise exception 'Gere no máximo 180 dias à frente'; end if;
  select u.timezone into v_tz from public.units u where u.id = s.unit_id;

  d := greatest(s.starts_on, current_date);
  while d <= least(coalesce(s.ends_on, p_until), p_until) loop
    if extract(isodow from d) = s.weekday then
      v_start := (d + s.start_time) at time zone v_tz;
      insert into public.appointments
        (clinic_id, unit_id, service_id, professional_id, series_id, starts_at, ends_at, capacity, slot_at)
      values
        (s.clinic_id, s.unit_id, s.service_id, s.professional_id, s.id,
         v_start, v_start + make_interval(mins => s.duration_min), s.capacity, v_start)
      on conflict (series_id, slot_at) where series_id is not null do nothing
      returning id into v_appt;

      if v_appt is not null then
        v_count := v_count + 1;
        insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, enrollment_id)
        select e.clinic_id, v_appt, e.patient_id, e.id
          from public.enrollments e
         where e.series_id = s.id and e.starts_on <= d and (e.ends_on is null or e.ends_on >= d)
        on conflict (appointment_id, patient_id) do nothing;
      end if;
      v_appt := null;
    end if;
    d := d + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.generate_series_occurrences(uuid, date) from public, anon;
grant execute on function public.generate_series_occurrences(uuid, date) to authenticated;

-- Histórico de mudanças (para avisar os alunos e mostrar no app deles)
create table public.appointment_changes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  old_starts_at timestamptz not null,
  new_starts_at timestamptz not null,
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id) on delete cascade
);
create index appointment_changes_appt_idx on public.appointment_changes (appointment_id, created_at desc);
create index appointment_changes_clinic_idx on public.appointment_changes (clinic_id, created_at desc);
alter table public.appointment_changes enable row level security;
create policy appointment_changes_select on public.appointment_changes for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or exists (select 1 from public.appointments a where a.id = appointment_id and a.professional_id in (select private.my_professional_ids())));
create policy appointment_changes_insert on public.appointment_changes for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao'));

-- App do paciente: aulas/sessões que mudaram de dia (últimos 14 dias, ainda por vir)
create function public.portal_changes(p_token text)
returns table (appointment_id uuid, title text, old_starts_at timestamptz, new_starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select distinct on (c.appointment_id) c.appointment_id,
         coalesce(rs.name, sv.name) as title, c.old_starts_at, a.starts_at
    from public.patients p
    join public.appointment_attendees t on t.patient_id = p.id and t.status in ('agendado', 'confirmado')
    join public.appointments a on a.id = t.appointment_id and a.status = 'agendado' and a.starts_at > now()
    join public.appointment_changes c on c.appointment_id = a.id and c.created_at > now() - interval '14 days'
    left join public.recurring_series rs on rs.id = a.series_id
    left join public.services sv on sv.id = a.service_id
   where p.portal_token = p_token and length(p_token) >= 32 and p.active
   order by c.appointment_id, c.created_at asc
$$;
revoke execute on function public.portal_changes(text) from public;
grant execute on function public.portal_changes(text) to anon, authenticated;
