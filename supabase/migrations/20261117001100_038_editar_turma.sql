-- Editar turma: muda dia, horário, duração, serviço, professor, vagas e nome.
-- As próximas aulas (ainda não acontecidas, agendadas) vão junto para o novo dia/horário;
-- as que já aconteceram ou foram canceladas ficam como estão. Roda com as permissões de quem chama (RLS).
create or replace function public.update_series(
  p_series uuid, p_name text, p_weekday smallint, p_start time, p_duration integer,
  p_service uuid, p_professional uuid, p_capacity integer
) returns integer
language plpgsql set search_path = ''
as $$
declare
  s record; v_tz text; a record; v_week date; v_day date; v_new timestamptz; v_moved integer := 0; v_enrolled integer;
begin
  select * into s from public.recurring_series where id = p_series and active;
  if not found then raise exception 'Turma não encontrada ou encerrada'; end if;
  if p_weekday not between 1 and 7 then raise exception 'Dia da semana inválido'; end if;
  if p_duration not between 5 and 600 then raise exception 'Duração inválida'; end if;
  select count(*) into v_enrolled from public.enrollments e
   where e.series_id = p_series and (e.ends_on is null or e.ends_on >= current_date);
  if p_capacity < greatest(v_enrolled, 1) then
    raise exception 'A turma tem % alunos fixos. As vagas não podem ser menos que isso.', v_enrolled;
  end if;
  select u.timezone into v_tz from public.units u where u.id = s.unit_id;

  update public.recurring_series
     set name = nullif(trim(p_name), ''), weekday = p_weekday, start_time = p_start, duration_min = p_duration,
         service_id = p_service, professional_id = p_professional, capacity = p_capacity
   where id = p_series;

  for a in
    select id, coalesce(slot_at, starts_at) as slot
      from public.appointments
     where series_id = p_series and status = 'agendado' and starts_at > now()
     order by starts_at
  loop
    v_week := ((a.slot at time zone v_tz)::date) - (extract(isodow from (a.slot at time zone v_tz)::date)::int - 1);
    v_day := v_week + (p_weekday - 1);
    v_new := (v_day + p_start) at time zone v_tz;
    if v_new <= now() then continue; end if; -- nunca joga uma aula para o passado
    update public.appointments
       set starts_at = v_new, ends_at = v_new + make_interval(mins => p_duration), slot_at = v_new,
           service_id = p_service, professional_id = p_professional, capacity = p_capacity
     where id = a.id;
    v_moved := v_moved + 1;
  end loop;
  return v_moved;
end $$;
revoke execute on function public.update_series(uuid, text, smallint, time, integer, uuid, uuid, integer) from public, anon;
grant execute on function public.update_series(uuid, text, smallint, time, integer, uuid, uuid, integer) to authenticated;
