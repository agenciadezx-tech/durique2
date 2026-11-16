-- Durique · Etapa 4: alta do paciente, metas, funil de contatos e "Saúde do negócio"

-- ===== Alta / fim de tratamento =====
create table public.discharges (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  kind text not null default 'alta' check (kind in ('alta', 'abandono', 'pausa')),
  discharged_on date not null default current_date,
  notes text check (length(notes) <= 500),
  professional_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);
create index on public.discharges (clinic_id, discharged_on);
create index on public.discharges (clinic_id, patient_id);
alter table public.discharges enable row level security;
create policy discharges_select on public.discharges for select to authenticated using (private.is_member(clinic_id));
create policy discharges_insert on public.discharges for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao', 'profissional'));

-- ===== Metas =====
create table public.clinic_goals (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  target numeric not null check (target >= 0),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);
alter table public.clinic_goals enable row level security;
create policy goals_select on public.clinic_goals for select to authenticated using (private.is_member(clinic_id));
create policy goals_insert on public.clinic_goals for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy goals_update on public.clinic_goals for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

-- ===== Funil de contatos (CRM) =====
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  source text check (length(source) <= 40),
  interest text check (length(interest) <= 120),
  stage text not null default 'novo' check (stage in ('novo', 'contato', 'avaliacao', 'efetivado', 'perdido')),
  notes text check (length(notes) <= 2000),
  next_action_on date,
  next_action text check (length(next_action) <= 160),
  lost_reason text check (length(lost_reason) <= 160),
  patient_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);
create index on public.leads (clinic_id, stage, updated_at desc);
create index on public.leads (clinic_id, patient_id);
alter table public.leads enable row level security;
create policy leads_select on public.leads for select to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy leads_insert on public.leads for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy leads_update on public.leads for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));

-- Quem agenda pelo link pela primeira vez entra no funil como "Avaliação"
create or replace function private.booking_patient(p_clinic uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Informe seu nome completo'; end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Informe um WhatsApp válido com DDD'; end if;
  select id into v from public.patients where clinic_id = p_clinic and phone = p_phone order by active desc, created_at limit 1;
  if v is null then
    insert into public.patients (clinic_id, name, phone, notes) values (p_clinic, trim(p_name), p_phone, 'Cadastrado pelo agendamento online')
    returning id into v;
    insert into public.leads (clinic_id, name, phone, source, stage, patient_id, notes, created_by)
    values (p_clinic, trim(p_name), p_phone, 'Agendamento online', 'avaliacao', v, 'Marcou pelo link da clínica', null);
  end if;
  if (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
       where t.patient_id = v and t.booked_online and a.starts_at > now() and t.status::text in ('agendado', 'confirmado')) >= 3 then
    raise exception 'Você já tem horários marcados. Fale com a clínica para marcar mais.';
  end if;
  return v;
end $$;

-- ===== Cor nas categorias financeiras =====
alter table public.categories add column color text check (color ~ '^#[0-9a-fA-F]{6}$');

-- ===== Saúde do negócio (indicadores do período) =====
create function public.business_health(p_clinic uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'America/Sao_Paulo';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v_slots numeric;
begin
  if not private.has_role(p_clinic, 'admin', 'financeiro') then return null; end if;

  -- Capacidade de consultas: minutos de atendimento no período ÷ 50 min
  select sum(extract(epoch from (av.end_time - av.start_time)) / 60 / 50) into v_slots
    from generate_series(p_from, p_to, interval '1 day') d
    join public.availability av on av.clinic_id = p_clinic and av.weekday = extract(isodow from d);

  return jsonb_build_object(
    'consultas', jsonb_build_object(
      'ticket_pacote', (select round(avg(k.price_cents)) from public.patient_packages k
                         where k.clinic_id = p_clinic and k.kind = 'pacote' and k.created_at >= v_start and k.created_at < v_end),
      'sessoes', (select count(*) from public.appointments a join public.services s on s.id = a.service_id
                   where a.clinic_id = p_clinic and a.status = 'agendado' and a.capacity = 1 and s.kind <> 'turma'
                     and a.starts_at >= v_start and a.starts_at < v_end),
      'capacidade', round(v_slots),
      'altas', (select count(*) from public.discharges x where x.clinic_id = p_clinic and x.kind = 'alta' and x.discharged_on between p_from and p_to),
      'encerrados', (select count(*) from public.patient_packages k where k.clinic_id = p_clinic and k.kind = 'pacote'
                      and k.expires_on between p_from and p_to),
      'churn', (select count(*) from public.patient_packages k
                 left join public.package_usage u on u.package_id = k.id
                 where k.clinic_id = p_clinic and k.kind = 'pacote' and k.expires_on between p_from and p_to
                   and coalesce(u.used, 0) < coalesce(k.total_sessions, 0)
                   and not exists (select 1 from public.discharges x where x.patient_id = k.patient_id and x.discharged_on >= k.starts_on)
                   and not exists (select 1 from public.patient_packages n where n.patient_id = k.patient_id and n.id <> k.id and n.created_at > k.created_at))
    ),
    'aulas', jsonb_build_object(
      'ticket_mensal', (select round(avg(k.price_cents)) from public.patient_packages k
                         where k.clinic_id = p_clinic and k.kind = 'plano' and k.status = 'ativo'),
      'vagas', (select coalesce(sum(a.capacity), 0) from public.appointments a
                 where a.clinic_id = p_clinic and a.status = 'agendado' and a.capacity > 1 and a.starts_at >= v_start and a.starts_at < least(v_end, now())),
      'ocupadas', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                    where a.clinic_id = p_clinic and a.status = 'agendado' and a.capacity > 1 and a.starts_at >= v_start and a.starts_at < least(v_end, now())
                      and t.status::text not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo', 'removido')),
      'novas_matriculas', (select count(*) from public.enrollments e where e.clinic_id = p_clinic and e.starts_on between p_from and p_to),
      'saidas', (select count(*) from public.enrollments e where e.clinic_id = p_clinic and e.ends_on between p_from and p_to),
      'ativas_inicio', (select count(*) from public.enrollments e where e.clinic_id = p_clinic and e.starts_on < p_from and (e.ends_on is null or e.ends_on >= p_from))
    ),
    'sinais', jsonb_build_object(
      'leads', (select count(*) from public.leads l where l.clinic_id = p_clinic and l.created_at >= v_start and l.created_at < v_end),
      'confirmados', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                       where a.clinic_id = p_clinic and a.status = 'agendado' and a.starts_at >= now() and a.starts_at < now() + interval '7 days'
                         and t.status = 'confirmado'),
      'a_confirmar', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                       where a.clinic_id = p_clinic and a.status = 'agendado' and a.starts_at >= now() and a.starts_at < now() + interval '7 days'
                         and t.status::text in ('agendado', 'confirmado')),
      'faltas', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                  where a.clinic_id = p_clinic and a.starts_at >= v_start and a.starts_at < v_end and t.status = 'falta'),
      'feitas', (select count(*) from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                  where a.clinic_id = p_clinic and a.starts_at >= v_start and a.starts_at < v_end and t.status::text in ('presente', 'falta')),
      'nps_n', (select count(*) from public.feedback f where f.clinic_id = p_clinic and f.created_at >= v_start and f.created_at < v_end),
      'nps', (select round(100.0 * (count(*) filter (where score >= 9) - count(*) filter (where score <= 6)) / nullif(count(*), 0))
                from public.feedback f where f.clinic_id = p_clinic and f.created_at >= v_start and f.created_at < v_end)
    ),
    'caixa', jsonb_build_object(
      'entrou', (select coalesce(sum(amount_cents), 0) from public.transactions x where x.clinic_id = p_clinic and x.type = 'receita' and x.paid_on between p_from and p_to),
      'saiu', (select coalesce(sum(amount_cents), 0) from public.transactions x where x.clinic_id = p_clinic and x.type = 'despesa' and x.paid_on between p_from and p_to),
      'a_receber', (select coalesce(sum(amount_cents), 0) from public.transactions x where x.clinic_id = p_clinic and x.type = 'receita' and x.paid_on is null and x.due_date <= p_to)
    ),
    'faltosos', coalesce((select jsonb_agg(jsonb_build_object('id', q.patient_id, 'name', p.name, 'n', q.n) order by q.n desc)
                 from (select t.patient_id, count(*) n from public.appointment_attendees t join public.appointments a on a.id = t.appointment_id
                        where a.clinic_id = p_clinic and a.starts_at >= v_start and a.starts_at < v_end and t.status = 'falta'
                        group by t.patient_id having count(*) >= 2 order by count(*) desc limit 5) q
                 join public.patients p on p.id = q.patient_id), '[]'::jsonb),
    'atrasados', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'cents', q.total, 'dias', q.dias) order by q.dias desc)
                 from (select x.patient_id, sum(x.amount_cents) total, max(current_date - x.due_date) dias from public.transactions x
                        where x.clinic_id = p_clinic and x.type = 'receita' and x.paid_on is null and x.due_date < current_date and x.patient_id is not null
                        group by x.patient_id order by max(current_date - x.due_date) desc limit 5) q
                 join public.patients p on p.id = q.patient_id), '[]'::jsonb)
  );
end $$;

revoke execute on function public.business_health(uuid, date, date) from public, anon;
grant execute on function public.business_health(uuid, date, date) to authenticated;
