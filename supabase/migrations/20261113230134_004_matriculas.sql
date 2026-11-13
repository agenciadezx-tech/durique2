-- Novo status: paciente saiu do horário fixo (mantém histórico, nada é apagado)
alter type public.attendee_status add value if not exists 'removido';

-- Vagas: "removido" não ocupa vaga
create or replace function private.check_appointment_capacity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_capacity integer; v_taken integer;
begin
  if new.status::text in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido') then
    return new;
  end if;
  select a.capacity into v_capacity from public.appointments a where a.id = new.appointment_id for update;
  select count(*) into v_taken from public.appointment_attendees t
   where t.appointment_id = new.appointment_id
     and t.id <> new.id
     and t.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido');
  if v_taken >= v_capacity then
    raise exception 'Sessão lotada: % de % vagas ocupadas', v_taken, v_capacity using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Matricular paciente num horário fixo: respeita vagas e já coloca nas sessões futuras
create function public.enroll_patient(p_series uuid, p_patient uuid, p_from date default current_date)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare s record; v_taken int; v_enr uuid; a record;
begin
  select * into s from public.recurring_series where id = p_series and active for update;
  if not found then raise exception 'Horário não encontrado'; end if;
  if exists (select 1 from public.enrollments e where e.series_id = p_series and e.patient_id = p_patient
             and (e.ends_on is null or e.ends_on >= p_from)) then
    raise exception 'Este paciente já está neste horário';
  end if;
  select count(*) into v_taken from public.enrollments e
   where e.series_id = p_series and (e.ends_on is null or e.ends_on >= p_from);
  if v_taken >= s.capacity then
    raise exception 'Horário cheio: % de % vagas ocupadas', v_taken, s.capacity;
  end if;

  insert into public.enrollments (clinic_id, series_id, patient_id, starts_on)
  values (s.clinic_id, p_series, p_patient, p_from) returning id into v_enr;

  for a in select ap.id from public.appointments ap
            where ap.series_id = p_series and ap.status = 'agendado'
              and ap.starts_at >= greatest(now(), p_from::timestamptz) loop
    begin
      insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, enrollment_id)
      values (s.clinic_id, a.id, p_patient, v_enr)
      on conflict (appointment_id, patient_id) do update
        set status = 'agendado', enrollment_id = excluded.enrollment_id
        where public.appointment_attendees.status::text = 'removido';
    exception when sqlstate 'P0001' then null; -- sessão já lotada (ex.: reposição): pula
    end;
  end loop;
  return v_enr;
end $$;

-- Tirar paciente do horário fixo a partir de hoje (marca as sessões futuras como "removido")
create function public.end_enrollment(p_enrollment uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.enrollments set ends_on = greatest(starts_on, current_date - 1) where id = p_enrollment;
  if not found then raise exception 'Matrícula não encontrada'; end if;
  update public.appointment_attendees t set status = 'removido'
    from public.appointments a
   where a.id = t.appointment_id and t.enrollment_id = p_enrollment
     and a.starts_at >= now() and t.status::text in ('agendado', 'confirmado');
end $$;

-- Encerrar um horário fixo: cancela as sessões futuras
create function public.end_series(p_series uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.recurring_series set active = false, ends_on = greatest(starts_on, current_date - 1) where id = p_series;
  if not found then raise exception 'Horário não encontrado'; end if;
  update public.appointments set status = 'cancelado'
   where series_id = p_series and starts_at >= now() and status = 'agendado';
end $$;

-- Garante a agenda gerada para todos os horários fixos ativos da clínica
create function public.ensure_agenda(p_clinic uuid, p_days int default 56)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare r record; v_total int := 0;
begin
  if not private.has_role(p_clinic, 'admin', 'recepcao') then return 0; end if;
  for r in select id from public.recurring_series where clinic_id = p_clinic and active loop
    v_total := v_total + public.generate_series_occurrences(r.id, current_date + least(p_days, 180));
  end loop;
  return v_total;
end $$;

revoke execute on function public.enroll_patient(uuid, uuid, date), public.end_enrollment(uuid),
  public.end_series(uuid), public.ensure_agenda(uuid, int) from public, anon;
grant execute on function public.enroll_patient(uuid, uuid, date), public.end_enrollment(uuid),
  public.end_series(uuid), public.ensure_agenda(uuid, int) to authenticated;
