-- Durique · Identidade da clínica: logo, banner e frase; arquivos no Storage; painel do aluno com mais destaque

alter table public.clinics
  add column logo_url text check (logo_url ~ '^https://'),
  add column banner_url text check (banner_url ~ '^https://'),
  add column tagline text check (length(tagline) <= 80);

-- Arquivos públicos da clínica (logo e banner), cada clínica numa pasta com o próprio id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy clinic_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinic-assets' and private.has_role(((storage.foldername(name))[1])::uuid, 'admin'));
create policy clinic_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'clinic-assets' and private.has_role(((storage.foldername(name))[1])::uuid, 'admin'))
  with check (bucket_id = 'clinic-assets' and private.has_role(((storage.foldername(name))[1])::uuid, 'admin'));
create policy clinic_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clinic-assets' and private.has_role(((storage.foldername(name))[1])::uuid, 'admin'));

create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.patients; v_notice int; v jsonb;
begin
  p := private.portal_patient(p_token);
  if p.id is null then return null; end if;
  select coalesce(cancel_notice_hours, 12) into v_notice from public.clinic_settings where clinic_id = p.clinic_id;

  select jsonb_build_object(
    'patient', jsonb_build_object('name', p.name, 'phone', p.phone),
    'clinic', (select jsonb_build_object('name', c.name, 'whatsapp', c.contact_whatsapp, 'instagram', c.instagram,
                       'color', c.brand_color, 'booking_slug', case when c.booking_enabled then c.booking_slug end,
                       'logo', c.logo_url, 'address', c.address, 'tagline', c.tagline)
                 from public.clinics c where c.id = p.clinic_id),
    'notice_hours', coalesce(v_notice, 12),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attendee_id', t.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', t.status,
               'service', s.name, 'professional', pr.name, 'is_makeup', t.is_makeup,
               'notice_hours', coalesce(s.cancel_notice_hours, v_notice, 12))
             order by a.starts_at)
        from public.appointment_attendees t
        join public.appointments a on a.id = t.appointment_id
        join public.services s on s.id = a.service_id
        join public.professionals pr on pr.id = a.professional_id
       where t.patient_id = p.id and a.status = 'agendado' and a.starts_at >= now() - interval '2 hours'
         and a.starts_at < now() + interval '30 days' and t.status::text <> 'removido'), '[]'::jsonb),
    'credits', coalesce((
      select jsonb_agg(jsonb_build_object('expires_on', c.expires_on) order by c.expires_on)
        from public.makeup_credits c
       where c.patient_id = p.id and c.status = 'disponivel' and c.expires_on >= current_date), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', k.name, 'kind', k.kind, 'total', k.total_sessions, 'expires_on', k.expires_on,
               'service', (select s.name from public.services s where s.id = k.service_id),
               'price_cents', k.price_cents, 'per_week', k.sessions_per_week,
               'used', (select count(*) from public.appointment_attendees u
                         where u.package_id = k.id and u.status::text in ('presente', 'falta', 'desmarcado_fora_prazo'))))
        from public.patient_packages k
       where k.patient_id = p.id and k.status = 'ativo' and (k.expires_on is null or k.expires_on >= current_date)), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('title', d.title, 'token', d.token))
        from public.patient_documents d where d.patient_id = p.id and d.status = 'pendente'), '[]'::jsonb),
    'open_classes', coalesce((
      select jsonb_agg(x order by x->>'starts_at') from (
        select jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'service', s.name,
                 'professional', pr.name,
                 'free', a.capacity - (select count(*) from public.appointment_attendees o
                                        where o.appointment_id = a.id
                                          and o.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido'))) as x
          from public.appointments a
          join public.services s on s.id = a.service_id
          join public.professionals pr on pr.id = a.professional_id
         where a.clinic_id = p.clinic_id and a.status = 'agendado' and a.capacity > 1
           and a.starts_at > now() + interval '2 hours' and a.starts_at < now() + interval '14 days'
           and not exists (select 1 from public.appointment_attendees m
                            where m.appointment_id = a.id and m.patient_id = p.id and m.status::text <> 'removido')
      ) q where (x->>'free')::int > 0), '[]'::jsonb),
    'fixed', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', r.weekday, 'time', to_char(r.start_time, 'HH24:MI'), 'service', s.name) order by r.weekday, r.start_time)
        from public.enrollments e
        join public.recurring_series r on r.id = e.series_id and r.active
        join public.services s on s.id = r.service_id
       where e.patient_id = p.id and (e.ends_on is null or e.ends_on >= current_date)), '[]'::jsonb),
    'pre_assessments', coalesce((
      select jsonb_agg(jsonb_build_object('token', pa.token, 'kind', pa.kind))
        from public.pre_assessments pa where pa.patient_id = p.id and pa.answered_at is null
         and pa.created_at > now() - interval '30 days'), '[]'::jsonb)
  ) into v;
  return v;
end $$;


create or replace function public.booking_info(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clinic', c.name,
    'message', c.booking_message,
    'logo', c.logo_url,
    'banner', c.banner_url,
    'tagline', c.tagline,
    'color', c.brand_color,
    'whatsapp', c.contact_whatsapp,
    'instagram', c.instagram,
    'address', c.address,
    'show_prices', c.show_prices,
    'waitlist', c.waitlist_public,
    'notice_hours', coalesce((select cancel_notice_hours from public.clinic_settings where clinic_id = c.id), 12),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind,
                   'duration', s.duration_min, 'price_cents', case when c.show_prices then s.price_cents end) order by s.name)
                from public.services s where s.clinic_id = c.id and s.active and s.bookable), '[]'::jsonb))
    from public.clinics c where c.id = private.booking_clinic(p_slug)
$$;

