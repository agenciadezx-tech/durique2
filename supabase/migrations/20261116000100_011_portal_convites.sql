-- Durique · Portal do aluno (link pessoal) e convites da equipe

-- ===== Portal do aluno =====
alter table public.patients
  add column portal_token text unique default encode(extensions.gen_random_bytes(16), 'hex');
update public.patients set portal_token = encode(extensions.gen_random_bytes(16), 'hex') where portal_token is null;
alter table public.patients alter column portal_token set not null;

create function private.portal_patient(p_token text)
returns public.patients language sql stable security definer set search_path = ''
as $$
  select p.* from public.patients p where p.portal_token = p_token and length(p_token) >= 32 and p.active
$$;

-- Tudo que o aluno vê no link: próximas aulas, créditos, pacotes, termos pendentes e vagas para reposição
create function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.patients; v_notice int; v jsonb;
begin
  p := private.portal_patient(p_token);
  if p.id is null then return null; end if;
  select coalesce(cancel_notice_hours, 12) into v_notice from public.clinic_settings where clinic_id = p.clinic_id;

  select jsonb_build_object(
    'patient', jsonb_build_object('name', p.name),
    'clinic', (select jsonb_build_object('name', c.name) from public.clinics c where c.id = p.clinic_id),
    'notice_hours', coalesce(v_notice, 12),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attendee_id', t.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', t.status,
               'service', s.name, 'professional', pr.name, 'is_makeup', t.is_makeup)
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
      ) q where (x->>'free')::int > 0), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Confirmar presença pelo link
create function public.portal_confirm(p_token text, p_attendee uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare p public.patients;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  update public.appointment_attendees t set status = 'confirmado'
    from public.appointments a
   where t.id = p_attendee and t.patient_id = p.id and a.id = t.appointment_id
     and a.starts_at > now() and t.status = 'agendado';
  if not found then raise exception 'Não foi possível confirmar esta aula'; end if;
end $$;

-- Desmarcar pelo link (aplica a regra de antecedência da clínica)
create function public.portal_cancel(p_token text, p_attendee uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare p public.patients; v_start timestamptz; v_notice int; v_status text;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  select a.starts_at into v_start from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
   where t.id = p_attendee and t.patient_id = p.id and t.status in ('agendado', 'confirmado') and a.starts_at > now();
  if v_start is null then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  select coalesce(cancel_notice_hours, 12) into v_notice from public.clinic_settings where clinic_id = p.clinic_id;
  v_status := case when v_start - now() >= make_interval(hours => coalesce(v_notice, 12)) then 'desmarcado_no_prazo' else 'desmarcado_fora_prazo' end;
  update public.appointment_attendees set status = v_status::public.attendee_status where id = p_attendee;
  return v_status;
end $$;

-- Agendar reposição pelo link (precisa ter crédito válido e vaga)
create function public.portal_book_makeup(p_token text, p_appointment uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare p public.patients; a record;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  if not exists (select 1 from public.makeup_credits c where c.patient_id = p.id and c.status = 'disponivel' and c.expires_on >= current_date) then
    raise exception 'Você não tem reposição disponível';
  end if;
  select * into a from public.appointments where id = p_appointment and clinic_id = p.clinic_id and status = 'agendado'
     and capacity > 1 and starts_at > now() + interval '2 hours';
  if not found then raise exception 'Aula indisponível'; end if;
  insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, is_makeup)
  values (p.clinic_id, p_appointment, p.id, true)
  on conflict (appointment_id, patient_id) do update set status = 'agendado', is_makeup = true
    where public.appointment_attendees.status::text in ('removido', 'desmarcado_no_prazo', 'desmarcado_fora_prazo');
end $$;

create function public.rotate_portal_token(p_patient uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare v text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  update public.patients set portal_token = v where id = p_patient;
  if not found then raise exception 'Paciente não encontrado'; end if;
  return v;
end $$;

-- ===== Convites da equipe =====
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  professional_id uuid,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz,
  revoked boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id) on delete set null (professional_id)
);
create index on public.invites (clinic_id, created_at desc);
create index on public.invites (clinic_id, professional_id);

create function public.get_invite(p_token text)
returns table (clinic_name text, role public.member_role, email text, valid boolean)
language sql stable security definer set search_path = ''
as $$
  select c.name, i.role, i.email,
         (not i.revoked and i.accepted_at is null and i.expires_at > now())
    from public.invites i join public.clinics c on c.id = i.clinic_id
   where i.token = p_token and length(p_token) >= 32
$$;

create function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare i public.invites; v_member uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Entre na sua conta para aceitar o convite'; end if;
  select * into i from public.invites where token = p_token for update;
  if not found or i.revoked or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'Convite inválido ou expirado';
  end if;
  insert into public.members (clinic_id, user_id, role) values (i.clinic_id, v_uid, i.role)
  on conflict (clinic_id, user_id) do update set role = excluded.role, active = true
  returning id into v_member;
  if i.professional_id is not null then
    update public.professionals set member_id = v_member where id = i.professional_id and clinic_id = i.clinic_id;
  end if;
  update public.invites set accepted_by = v_uid, accepted_at = now() where id = i.id;
  return i.clinic_id;
end $$;

-- Equipe com e-mail (só admin)
create function public.clinic_members(p_clinic uuid)
returns table (member_id uuid, user_id uuid, email text, role public.member_role, active boolean, professional_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, u.email::text, m.role, m.active,
         (select p.name from public.professionals p where p.member_id = m.id limit 1), m.created_at
    from public.members m join auth.users u on u.id = m.user_id
   where m.clinic_id = p_clinic and private.has_role(p_clinic, 'admin')
   order by m.created_at
$$;

-- ===== Permissões =====
revoke execute on function private.portal_patient(text) from public, anon, authenticated;
revoke execute on function public.portal_get(text), public.portal_confirm(text, uuid), public.portal_cancel(text, uuid),
  public.portal_book_makeup(text, uuid), public.get_invite(text) from public;
grant execute on function public.portal_get(text), public.portal_confirm(text, uuid), public.portal_cancel(text, uuid),
  public.portal_book_makeup(text, uuid), public.get_invite(text) to anon, authenticated;
revoke execute on function public.accept_invite(text), public.clinic_members(uuid), public.rotate_portal_token(uuid) from public, anon;
grant execute on function public.accept_invite(text), public.clinic_members(uuid), public.rotate_portal_token(uuid) to authenticated;

alter table public.invites enable row level security;
create policy invites_select on public.invites for select to authenticated using (private.has_role(clinic_id, 'admin'));
create policy invites_insert on public.invites for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy invites_update on public.invites for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));
