-- Limite de reposições por mês do serviço (0 = sem limite)
create or replace function private.handle_makeup_credit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_day date; v_days int; v_credit uuid; v_rule text; v_mdays int; v_max int; v_svc uuid; v_used int;
begin
  if new.status::text = 'desmarcado_no_prazo' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select (a.starts_at at time zone 'America/Sao_Paulo')::date, s.notice_rule, s.makeup_days, s.makeup_max_month, s.id
      into v_day, v_rule, v_mdays, v_max, v_svc
      from public.appointments a join public.services s on s.id = a.service_id where a.id = new.appointment_id;
    if coalesce(v_max, 0) > 0 then
      select count(*) into v_used from public.makeup_credits c
        join public.appointment_attendees o on o.id = c.origin_attendee_id
        join public.appointments oa on oa.id = o.appointment_id
       where c.patient_id = new.patient_id and oa.service_id = v_svc and c.status <> 'cancelado'
         and date_trunc('month', c.origin_date) = date_trunc('month', v_day) and c.origin_attendee_id <> new.id;
    end if;
    if coalesce(v_rule, 'credito') = 'credito'
       and (coalesce(v_max, 0) = 0 or coalesce(v_used, 0) < v_max)
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
