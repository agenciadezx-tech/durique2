-- Durique · Bloquear horário (folga, reunião, feriado) — de um profissional ou da clínica toda

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid,                 -- null = clínica toda
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (length(reason) <= 120),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id) on delete cascade
);
create index on public.time_blocks (clinic_id, starts_at);
create index on public.time_blocks (clinic_id, professional_id);

alter table public.time_blocks enable row level security;
create policy time_blocks_select on public.time_blocks for select to authenticated using (private.is_member(clinic_id));
create policy time_blocks_insert on public.time_blocks for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao') or professional_id in (select private.my_professional_ids()));
create policy time_blocks_delete on public.time_blocks for delete to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao') or professional_id in (select private.my_professional_ids()));

-- Agendamento online não oferece horário bloqueado
create or replace function public.booking_slots(p_slug text, p_service uuid, p_day date)
returns table (professional_id uuid, professional_name text, starts_at timestamptz)
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
     and not exists (
       select 1 from public.time_blocks b
        where b.clinic_id = v_clinic and (b.professional_id is null or b.professional_id = pr.id)
          and b.starts_at < slot + make_interval(mins => s.duration_min) and b.ends_at > slot)
   order by slot, pr.name;
end $$;
