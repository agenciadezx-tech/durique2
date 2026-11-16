-- Durique · Link único da clínica, painel do aluno, prazo por serviço, fila pelo link e pré-avaliação

-- ===== Identidade e regras da página pública =====
alter table public.clinics
  add column brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add column contact_whatsapp text check (contact_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  add column instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column address text check (length(address) <= 200),
  add column show_prices boolean not null default true,
  add column waitlist_public boolean not null default true;

-- Antecedência para desmarcar por serviço (vazio = regra da clínica)
alter table public.services add column cancel_notice_hours smallint check (cancel_notice_hours between 0 and 72);

create function private.notice_hours(p_appointment uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select coalesce(s.cancel_notice_hours, cs.cancel_notice_hours, 12)
    from public.appointments a
    join public.services s on s.id = a.service_id
    left join public.clinic_settings cs on cs.clinic_id = a.clinic_id
   where a.id = p_appointment
$$;

create or replace function public.portal_cancel(p_token text, p_attendee uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare p public.patients; v_start timestamptz; v_appt uuid; v_status text;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  select a.starts_at, a.id into v_start, v_appt from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
   where t.id = p_attendee and t.patient_id = p.id and t.status in ('agendado', 'confirmado') and a.starts_at > now();
  if v_start is null then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  v_status := case when v_start - now() >= make_interval(hours => private.notice_hours(v_appt)) then 'desmarcado_no_prazo' else 'desmarcado_fora_prazo' end;
  update public.appointment_attendees set status = v_status::public.attendee_status where id = p_attendee;
  return v_status;
end $$;

-- Painel do aluno: inclui prazo de cada sessão, contato da clínica e link de agendamento
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
                       'color', c.brand_color, 'booking_slug', case when c.booking_enabled then c.booking_slug end)
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
    'pre_assessments', coalesce((
      select jsonb_agg(jsonb_build_object('token', pa.token, 'kind', pa.kind))
        from public.pre_assessments pa where pa.patient_id = p.id and pa.answered_at is null
         and pa.created_at > now() - interval '30 days'), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Página pública: identidade, contato, preço opcional
create or replace function public.booking_info(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clinic', c.name,
    'message', c.booking_message,
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

-- Turmas lotadas (para entrar na fila de espera pelo link)
create function public.booking_full_classes(p_slug text, p_service uuid)
returns table (appointment_id uuid, starts_at timestamptz, professional_name text)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.starts_at, pr.name
    from public.appointments a
    join public.clinics c on c.id = a.clinic_id and c.waitlist_public
    join public.services s on s.id = a.service_id and s.bookable and s.active
    join public.professionals pr on pr.id = a.professional_id
   where a.clinic_id = private.booking_clinic(p_slug) and a.service_id = p_service and a.status = 'agendado'
     and a.starts_at > now() + interval '2 hours' and a.starts_at < now() + interval '21 days'
     and a.capacity <= (select count(*) from public.appointment_attendees o where o.appointment_id = a.id
                         and o.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido'))
   order by a.starts_at
$$;

create function public.booking_join_waitlist(p_slug text, p_appointment uuid, p_name text, p_phone text)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid := private.booking_clinic(p_slug); v_patient uuid; v_start timestamptz;
begin
  if v_clinic is null then raise exception 'Agendamento online indisponível'; end if;
  if not (select waitlist_public from public.clinics where id = v_clinic) then raise exception 'Lista de espera indisponível'; end if;
  select a.starts_at into v_start from public.appointments a
   where a.id = p_appointment and a.clinic_id = v_clinic and a.status = 'agendado' and a.starts_at > now() + interval '2 hours';
  if v_start is null then raise exception 'Aula indisponível'; end if;
  v_patient := private.booking_patient(v_clinic, p_name, p_phone);
  if exists (select 1 from public.waitlist w where w.appointment_id = p_appointment and w.patient_id = v_patient and w.status = 'aguardando') then
    raise exception 'Você já está na lista de espera desta aula';
  end if;
  insert into public.waitlist (clinic_id, patient_id, appointment_id, notes, created_by)
  values (v_clinic, v_patient, p_appointment, 'Entrou pelo link de agendamento', null);
  return v_start;
end $$;

-- ===== Porta 2 do link: "Já sou paciente" (WhatsApp + data de nascimento) =====
create table public.portal_login_attempts (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  phone text not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index on public.portal_login_attempts (clinic_id, phone, created_at);
alter table public.portal_login_attempts enable row level security; -- sem políticas: só funções do banco acessam

create function public.portal_login(p_slug text, p_phone text, p_birth date)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid := (select id from public.clinics where booking_slug = p_slug); v_token text;
begin
  if v_clinic is null then raise exception 'Clínica não encontrada'; end if;
  if (select count(*) from public.portal_login_attempts
       where clinic_id = v_clinic and phone = p_phone and not ok and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Muitas tentativas. Tente de novo em 1 hora ou fale com a clínica.';
  end if;
  select portal_token into v_token from public.patients
   where clinic_id = v_clinic and phone = p_phone and birth_date = p_birth and active
   order by created_at limit 1;
  insert into public.portal_login_attempts (clinic_id, phone, ok) values (v_clinic, p_phone, v_token is not null);
  return v_token;
end $$;

-- ===== Pré-avaliação =====
create table public.pre_assessment_forms (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null check (kind in ('consulta', 'aula')),
  fields jsonb not null default '{}'::jsonb,      -- {"campo": {"ask": true, "req": false}}
  questions jsonb not null default '[]'::jsonb,   -- [{"id":"q1","label":"...","req":false}]
  updated_at timestamptz not null default now(),
  primary key (clinic_id, kind)
);
alter table public.pre_assessment_forms enable row level security;
create policy pre_forms_select on public.pre_assessment_forms for select to authenticated using (private.is_member(clinic_id));
create policy pre_forms_insert on public.pre_assessment_forms for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy pre_forms_update on public.pre_assessment_forms for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

create table public.pre_assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  kind text not null check (kind in ('consulta', 'aula')),
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  config jsonb not null,                          -- cópia do formulário no momento do pedido
  answers jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);
create index on public.pre_assessments (clinic_id, patient_id, created_at desc);
alter table public.pre_assessments enable row level security;
-- respostas são dados de saúde: só quem vê o clínico
create policy pre_assessments_select on public.pre_assessments for select to authenticated
  using (private.can_see_clinical(clinic_id, patient_id));

-- Pedir (recepção, admin ou profissional): devolve o token do link
create function public.request_pre_assessment(p_patient uuid, p_kind text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid; v_cfg jsonb; v_token text;
begin
  select clinic_id into v_clinic from public.patients where id = p_patient;
  if v_clinic is null or not private.has_role(v_clinic, 'admin', 'recepcao', 'profissional') then raise exception 'Sem permissão'; end if;
  if p_kind not in ('consulta', 'aula') then raise exception 'Tipo inválido'; end if;
  select jsonb_build_object('fields', f.fields, 'questions', f.questions) into v_cfg
    from public.pre_assessment_forms f where f.clinic_id = v_clinic and f.kind = p_kind;
  insert into public.pre_assessments (clinic_id, patient_id, kind, config)
  values (v_clinic, p_patient, p_kind, coalesce(v_cfg, '{}'::jsonb))
  returning token into v_token;
  return v_token;
end $$;

-- Situação dos pedidos (sem as respostas) para a recepção
create function public.pre_assessment_status(p_patient uuid)
returns table (kind text, token text, created_at timestamptz, answered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select pa.kind, pa.token, pa.created_at, pa.answered_at
    from public.pre_assessments pa
   where pa.patient_id = p_patient and private.is_member(pa.clinic_id)
   order by pa.created_at desc limit 10
$$;

-- Página pública da pré-avaliação
create function public.get_pre_assessment(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('clinic', c.name, 'patient', split_part(p.name, ' ', 1), 'kind', pa.kind,
                            'config', pa.config, 'answered', pa.answered_at is not null)
    from public.pre_assessments pa
    join public.patients p on p.id = pa.patient_id
    join public.clinics c on c.id = pa.clinic_id
   where pa.token = p_token and length(p_token) >= 32 and pa.created_at > now() - interval '30 days'
$$;

create function public.submit_pre_assessment(p_token text, p_answers jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare pa public.pre_assessments; v_cpf text; v_birth date; v_email text;
begin
  select * into pa from public.pre_assessments where token = p_token and created_at > now() - interval '30 days' for update;
  if not found then raise exception 'Link inválido ou vencido'; end if;
  if pa.answered_at is not null then raise exception 'Esta pré-avaliação já foi respondida. Obrigado!'; end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 20000 then raise exception 'Respostas inválidas'; end if;
  update public.pre_assessments set answers = p_answers, answered_at = now() where id = pa.id;
  -- Completa só o que está vazio no cadastro
  v_cpf := nullif(regexp_replace(coalesce(p_answers->>'cpf', ''), '\D', '', 'g'), '');
  v_birth := case when coalesce(p_answers->>'nascimento', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_answers->>'nascimento')::date end;
  v_email := nullif(trim(coalesce(p_answers->>'email', '')), '');
  update public.patients set
    cpf = coalesce(cpf, case when v_cpf ~ '^\d{11}$' and not exists (select 1 from public.patients x where x.clinic_id = pa.clinic_id and x.cpf = v_cpf) then v_cpf end),
    birth_date = coalesce(birth_date, v_birth),
    email = coalesce(email, case when v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(v_email) end)
   where id = pa.patient_id;
end $$;

-- ===== Permissões =====
revoke execute on function private.notice_hours(uuid) from public, anon, authenticated;
revoke execute on function public.booking_full_classes(text, uuid), public.booking_join_waitlist(text, uuid, text, text),
  public.portal_login(text, text, date), public.get_pre_assessment(text), public.submit_pre_assessment(text, jsonb),
  public.request_pre_assessment(uuid, text), public.pre_assessment_status(uuid) from public;
grant execute on function public.booking_full_classes(text, uuid), public.booking_join_waitlist(text, uuid, text, text),
  public.portal_login(text, text, date), public.get_pre_assessment(text), public.submit_pre_assessment(text, jsonb) to anon, authenticated;
grant execute on function public.request_pre_assessment(uuid, text), public.pre_assessment_status(uuid) to authenticated;
