-- Durique · Serviços por paciente, pacotes acabando e pesquisa de satisfação

-- ===== O que cada paciente faz na clínica =====
-- Horário fixo ativo, pacote/plano ativo, ou sessão nos últimos 60 / próximos 30 dias. Respeita o RLS de quem consulta.
create view public.patient_services with (security_invoker = true) as
select distinct x.clinic_id, x.patient_id, x.service_id, s.name as service_name
  from (
    select e.clinic_id, e.patient_id, r.service_id
      from public.enrollments e join public.recurring_series r on r.id = e.series_id
     where e.ends_on is null or e.ends_on >= current_date
    union all
    select k.clinic_id, k.patient_id, k.service_id
      from public.patient_packages k
     where k.status = 'ativo' and k.service_id is not null
    union all
    select t.clinic_id, t.patient_id, a.service_id
      from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
     where a.status = 'agendado' and t.status::text <> 'removido'
       and a.starts_at between now() - interval '60 days' and now() + interval '30 days'
  ) x
  join public.services s on s.id = x.service_id;

-- ===== Pacotes acabando (≤ 2 sessões ou vencendo em até 7 dias) =====
create view public.packages_ending with (security_invoker = true) as
select k.id as package_id, k.clinic_id, k.patient_id, k.name, k.expires_on,
       k.total_sessions - coalesce(u.used, 0) as sessions_left
  from public.patient_packages k
  left join public.package_usage u on u.package_id = k.id
 where k.status = 'ativo' and k.kind = 'pacote'
   and ((k.total_sessions is not null and k.total_sessions - coalesce(u.used, 0) <= 2)
        or (k.expires_on is not null and k.expires_on <= current_date + 7));

-- ===== Pesquisa de satisfação =====
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  score smallint not null check (score between 0 and 10),
  comment text check (length(comment) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);
create index on public.feedback (clinic_id, created_at desc);
create index on public.feedback (clinic_id, patient_id);

alter table public.feedback enable row level security;
create policy feedback_select on public.feedback for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));

-- Perguntar? (3+ sessões feitas e nenhuma resposta nos últimos 90 dias)
create function private.feedback_due(p_patient uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.appointment_attendees where patient_id = p_patient and status = 'presente') >= 3
     and not exists (select 1 from public.feedback where patient_id = p_patient and created_at > now() - interval '90 days')
$$;

create function public.portal_feedback_due(p_token text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare p public.patients;
begin
  p := private.portal_patient(p_token);
  return p.id is not null and private.feedback_due(p.id);
end $$;

create function public.portal_feedback(p_token text, p_score smallint, p_comment text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare p public.patients;
begin
  p := private.portal_patient(p_token);
  if p.id is null then raise exception 'Link inválido'; end if;
  if exists (select 1 from public.feedback where patient_id = p.id and created_at > now() - interval '1 day') then
    raise exception 'Você já respondeu hoje. Obrigado!';
  end if;
  insert into public.feedback (clinic_id, patient_id, score, comment)
  values (p.clinic_id, p.id, p_score, nullif(trim(left(p_comment, 1000)), ''));
end $$;

revoke execute on function private.feedback_due(uuid) from public, anon, authenticated;
revoke execute on function public.portal_feedback_due(text), public.portal_feedback(text, smallint, text) from public;
grant execute on function public.portal_feedback_due(text), public.portal_feedback(text, smallint, text) to anon, authenticated;
revoke all on public.patient_services, public.packages_ending from anon;
grant select on public.patient_services, public.packages_ending to authenticated;
