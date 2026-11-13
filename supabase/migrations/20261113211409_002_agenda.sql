-- Durique · Fase 1 · Agenda: horários recorrentes, alunos fixos, sessões e participantes
create type public.appointment_status as enum ('agendado', 'cancelado');
create type public.attendee_status as enum (
  'agendado', 'confirmado', 'presente', 'falta', 'desmarcado_no_prazo', 'desmarcado_fora_prazo'
);

-- Horário recorrente semanal (ex.: pilates ter 7h); gera as sessões
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  unit_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = segunda ... 7 = domingo
  start_time time not null,
  duration_min integer not null check (duration_min between 5 and 480),
  capacity integer not null default 1 check (capacity >= 1),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (clinic_id, unit_id) references public.units(clinic_id, id),
  foreign key (clinic_id, service_id) references public.services(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);

-- Paciente fixo em um horário recorrente ("até cancelar")
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  series_id uuid not null,
  patient_id uuid not null,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (clinic_id, series_id) references public.recurring_series(clinic_id, id) on delete cascade,
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);

-- Sessão / aula (uma ocorrência na agenda)
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  unit_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  series_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity >= 1),
  status public.appointment_status not null default 'agendado',
  notes text,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (ends_at > starts_at),
  foreign key (clinic_id, unit_id) references public.units(clinic_id, id),
  foreign key (clinic_id, service_id) references public.services(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id),
  foreign key (clinic_id, series_id) references public.recurring_series(clinic_id, id) on delete set null (series_id)
);
create unique index appointments_series_start_uq on public.appointments (series_id, starts_at) where series_id is not null;

-- Paciente dentro de uma sessão (status de presença/falta)
create table public.appointment_attendees (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  patient_id uuid not null,
  enrollment_id uuid,
  status public.attendee_status not null default 'agendado',
  is_makeup boolean not null default false, -- reposição (regras na fase 3)
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (appointment_id, patient_id),
  foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id) on delete cascade,
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, enrollment_id) references public.enrollments(clinic_id, id) on delete set null (enrollment_id)
);

create index on public.recurring_series (clinic_id, weekday);
create index on public.recurring_series (professional_id);
create index on public.enrollments (series_id);
create index on public.enrollments (patient_id);
create index on public.appointments (clinic_id, starts_at);
create index on public.appointments (professional_id, starts_at);
create index on public.appointment_attendees (appointment_id);
create index on public.appointment_attendees (patient_id);

-- ===== Controle de vagas (impede passar da capacidade) =====
create function public.check_appointment_capacity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_capacity integer; v_taken integer;
begin
  if new.status in ('desmarcado_no_prazo', 'desmarcado_fora_prazo') then
    return new;
  end if;
  select a.capacity into v_capacity from public.appointments a where a.id = new.appointment_id for update;
  select count(*) into v_taken from public.appointment_attendees t
   where t.appointment_id = new.appointment_id
     and t.id <> new.id
     and t.status not in ('desmarcado_no_prazo', 'desmarcado_fora_prazo');
  if v_taken >= v_capacity then
    raise exception 'Sessão lotada: % de % vagas ocupadas', v_taken, v_capacity using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger appointment_attendees_capacity
before insert or update of status on public.appointment_attendees
for each row execute function public.check_appointment_capacity();

create function public.touch_attendee_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end $$;
create trigger appointment_attendees_touch
before update on public.appointment_attendees
for each row execute function public.touch_attendee_status();

-- ===== Geração das sessões a partir do horário recorrente =====
-- Roda com as permissões de quem chama (RLS vale): só admin/recepção conseguem gerar.
create function public.generate_series_occurrences(p_series uuid, p_until date)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  s record; v_tz text; d date; v_start timestamptz; v_appt uuid; v_count integer := 0;
begin
  select * into s from public.recurring_series where id = p_series and active;
  if not found then raise exception 'Horário recorrente não encontrado ou inativo'; end if;
  if p_until > current_date + 180 then raise exception 'Gere no máximo 180 dias à frente'; end if;
  select u.timezone into v_tz from public.units u where u.id = s.unit_id;

  d := greatest(s.starts_on, current_date);
  while d <= least(coalesce(s.ends_on, p_until), p_until) loop
    if extract(isodow from d) = s.weekday then
      v_start := (d + s.start_time) at time zone v_tz;
      insert into public.appointments
        (clinic_id, unit_id, service_id, professional_id, series_id, starts_at, ends_at, capacity)
      values
        (s.clinic_id, s.unit_id, s.service_id, s.professional_id, s.id,
         v_start, v_start + make_interval(mins => s.duration_min), s.capacity)
      on conflict (series_id, starts_at) where series_id is not null do nothing
      returning id into v_appt;

      if v_appt is not null then
        v_count := v_count + 1;
        insert into public.appointment_attendees (clinic_id, appointment_id, patient_id, enrollment_id)
        select e.clinic_id, v_appt, e.patient_id, e.id
          from public.enrollments e
         where e.series_id = s.id and e.starts_on <= d and (e.ends_on is null or e.ends_on >= d)
        on conflict (appointment_id, patient_id) do nothing;
      end if;
      v_appt := null;
    end if;
    d := d + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.generate_series_occurrences(uuid, date) from public, anon;
grant execute on function public.generate_series_occurrences(uuid, date) to authenticated;
revoke execute on function public.check_appointment_capacity() from public, anon, authenticated;

-- ===== RLS =====
alter table public.recurring_series enable row level security;
alter table public.enrollments enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_attendees enable row level security;

-- recurring_series
create policy series_select on public.recurring_series for select to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or professional_id in (select public.my_professional_ids()));
create policy series_write on public.recurring_series for all to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao'))
  with check (public.has_role(clinic_id, 'admin', 'recepcao'));

-- enrollments
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or exists (select 1 from public.recurring_series s
                    where s.id = series_id and s.professional_id in (select public.my_professional_ids())));
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao'))
  with check (public.has_role(clinic_id, 'admin', 'recepcao'));

-- appointments
create policy appointments_select on public.appointments for select to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or professional_id in (select public.my_professional_ids()));
create policy appointments_write on public.appointments for all to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao'))
  with check (public.has_role(clinic_id, 'admin', 'recepcao'));

-- appointment_attendees: profissional pode marcar presença/falta nas próprias sessões
create policy attendees_select on public.appointment_attendees for select to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or exists (select 1 from public.appointments a
                    where a.id = appointment_id and a.professional_id in (select public.my_professional_ids())));
create policy attendees_write on public.appointment_attendees for all to authenticated
  using (public.has_role(clinic_id, 'admin', 'recepcao'))
  with check (public.has_role(clinic_id, 'admin', 'recepcao'));
create policy attendees_update_prof on public.appointment_attendees for update to authenticated
  using (exists (select 1 from public.appointments a
                 where a.id = appointment_id and a.professional_id in (select public.my_professional_ids())))
  with check (exists (select 1 from public.appointments a
                 where a.id = appointment_id and a.professional_id in (select public.my_professional_ids())));

-- patients: profissional vê só quem atende
create policy patients_select_prof on public.patients for select to authenticated
  using (exists (select 1 from public.appointment_attendees t
                 join public.appointments a on a.id = t.appointment_id
                 where t.patient_id = patients.id
                   and a.professional_id in (select public.my_professional_ids())));
