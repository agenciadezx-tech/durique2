-- Permite encerrar no mesmo dia em que começou (ends_on = véspera do início = período vazio)
alter table public.enrollments drop constraint enrollments_check;
alter table public.enrollments add constraint enrollments_periodo_ck check (ends_on is null or ends_on >= starts_on - 1);
alter table public.recurring_series drop constraint recurring_series_check;
alter table public.recurring_series add constraint recurring_series_periodo_ck check (ends_on is null or ends_on >= starts_on - 1);

create or replace function public.end_enrollment(p_enrollment uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.enrollments set ends_on = greatest(starts_on - 1, current_date - 1) where id = p_enrollment;
  if not found then raise exception 'Matrícula não encontrada'; end if;
  update public.appointment_attendees t set status = 'removido'
    from public.appointments a
   where a.id = t.appointment_id and t.enrollment_id = p_enrollment
     and a.starts_at >= now() and t.status::text in ('agendado', 'confirmado');
end $$;

create or replace function public.end_series(p_series uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.recurring_series set active = false, ends_on = greatest(starts_on - 1, current_date - 1) where id = p_series;
  if not found then raise exception 'Horário não encontrado'; end if;
  update public.appointments set status = 'cancelado'
   where series_id = p_series and starts_at >= now() and status = 'agendado';
end $$;
