-- Períodos de atendimento sobrepostos não devem gerar o mesmo horário duas vezes
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
   order by slot, pr.name;
end $$;
