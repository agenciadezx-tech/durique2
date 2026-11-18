-- Serviços que cada profissional faz. Profissional sem nenhum serviço marcado = faz todos (como antes).
create table if not exists public.professional_services (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (professional_id, service_id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id) on delete cascade,
  foreign key (clinic_id, service_id) references public.services(clinic_id, id) on delete cascade
);
create index if not exists professional_services_clinic_idx on public.professional_services (clinic_id, service_id);
alter table public.professional_services enable row level security;
create policy ps_select on public.professional_services for select using (private.is_member(clinic_id));
create policy ps_write on public.professional_services for all
  using (private.has_role(clinic_id, 'admin'))
  with check (private.has_role(clinic_id, 'admin'));

create or replace function private.pro_does(p_professional uuid, p_service uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.professional_services where professional_id = p_professional)
      or exists (select 1 from public.professional_services where professional_id = p_professional and service_id = p_service)
$$;
revoke execute on function private.pro_does(uuid, uuid) from public, anon;
grant execute on function private.pro_does(uuid, uuid) to authenticated;

-- Convite com nome e WhatsApp
alter table public.invites add column if not exists name text, add column if not exists phone text;

-- Link de agendamento: só horários de quem faz o serviço
create or replace function public.booking_slots(p_slug text, p_service uuid, p_day date)
 returns table(professional_id uuid, professional_name text, starts_at timestamp with time zone)
 language plpgsql stable security definer set search_path to ''
as $function$
declare v_clinic uuid := private.booking_clinic(p_slug); s record;
begin
  if v_clinic is null or p_day < current_date or p_day > current_date + 60 then return; end if;
  select * into s from public.services where id = p_service and clinic_id = v_clinic and active and bookable and kind = 'individual';
  if not found then return; end if;
  return query
  select distinct pr.id, pr.name, slot
    from public.availability av
    join public.professionals pr on pr.id = av.professional_id and pr.active and private.pro_does(pr.id, s.id)
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
end $function$;

-- Lista de profissionais de cada serviço (para "Com quem?" no link)
create or replace function public.booking_info(p_slug text)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
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
                   'duration', s.duration_min, 'price_cents', case when c.show_prices then s.price_cents end,
                   'pros', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', split_part(pr.name, ' ', 1)) order by pr.name)
                              from public.professionals pr
                             where pr.clinic_id = c.id and pr.active and private.pro_does(pr.id, s.id)
                               and exists (select 1 from public.availability av where av.professional_id = pr.id)), '[]'::jsonb)
                 ) order by s.name)
                from public.services s where s.clinic_id = c.id and s.active and s.bookable), '[]'::jsonb))
    from public.clinics c where c.id = private.booking_clinic(p_slug)
$function$;
