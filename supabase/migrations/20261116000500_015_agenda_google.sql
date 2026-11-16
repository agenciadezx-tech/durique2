-- Durique · Link de calendário (.ics) por profissional, para assinar no Google Agenda / iPhone

alter table public.professionals
  add column calendar_token text unique default encode(extensions.gen_random_bytes(16), 'hex');
update public.professionals set calendar_token = encode(extensions.gen_random_bytes(16), 'hex') where calendar_token is null;
alter table public.professionals alter column calendar_token set not null;

-- Sessões do profissional (14 dias atrás até 60 à frente). Só primeiro nome do paciente (LGPD: mínimo necessário).
create function public.calendar_feed(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'professional', pr.name,
    'clinic', c.name,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'service', s.name,
        'capacity', a.capacity, 'cancelled', a.status = 'cancelado',
        'people', (select coalesce(jsonb_agg(split_part(p.name, ' ', 1) order by p.name), '[]'::jsonb)
                     from public.appointment_attendees t join public.patients p on p.id = t.patient_id
                    where t.appointment_id = a.id
                      and t.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido'))
      ) order by a.starts_at)
        from public.appointments a join public.services s on s.id = a.service_id
       where a.professional_id = pr.id
         and a.starts_at between now() - interval '14 days' and now() + interval '60 days'), '[]'::jsonb))
    from public.professionals pr join public.clinics c on c.id = pr.clinic_id
   where pr.calendar_token = p_token and length(p_token) >= 32 and pr.active
$$;

-- Gera um link novo (o antigo para de funcionar). Admin ou o próprio profissional.
create function public.rotate_calendar_token(p_professional uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v text := encode(extensions.gen_random_bytes(16), 'hex'); v_clinic uuid;
begin
  select clinic_id into v_clinic from public.professionals where id = p_professional;
  if v_clinic is null or not (private.has_role(v_clinic, 'admin') or p_professional in (select private.my_professional_ids())) then
    raise exception 'Sem permissão';
  end if;
  update public.professionals set calendar_token = v where id = p_professional;
  return v;
end $$;

revoke execute on function public.calendar_feed(text), public.rotate_calendar_token(uuid) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
revoke execute on function public.rotate_calendar_token(uuid) from anon;
grant execute on function public.rotate_calendar_token(uuid) to authenticated;
