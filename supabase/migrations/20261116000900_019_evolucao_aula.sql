-- Durique · Evolução da aula: o profissional avalia a sessão uma vez e vale para cada aluno que veio

create table public.session_evolutions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  professional_id uuid,
  level smallint check (level between 1 and 5),
  notes text check (length(notes) <= 2000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id),
  foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id) on delete cascade,
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);
create index on public.session_evolutions (clinic_id, professional_id);

create table public.patient_evolutions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  patient_id uuid not null,
  level smallint check (level between 1 and 5),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, patient_id),
  foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id) on delete cascade,
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);
create index on public.patient_evolutions (clinic_id, patient_id, created_at desc);

alter table public.session_evolutions enable row level security;
alter table public.patient_evolutions enable row level security;
create policy session_evolutions_select on public.session_evolutions for select to authenticated
  using (private.has_role(clinic_id, 'admin') or professional_id in (select private.my_professional_ids()));
create policy patient_evolutions_select on public.patient_evolutions for select to authenticated
  using (private.can_see_clinical(clinic_id, patient_id));

-- Salva a evolução da sessão e replica para cada aluno que veio (ou que está na sessão, se ainda não marcaram presença).
-- p_individual: [{"patient_id": "...", "level": 3, "note": "..."}] para ajustar um aluno específico.
create function public.save_session_evolution(p_appointment uuid, p_level smallint, p_notes text, p_individual jsonb default '[]'::jsonb)
returns int language plpgsql security definer set search_path = ''
as $$
declare a record; v_count int := 0; v_any_present boolean; t record; ind jsonb; v_level smallint; v_note text;
begin
  select * into a from public.appointments where id = p_appointment;
  if not found then raise exception 'Sessão não encontrada'; end if;
  if not (private.has_role(a.clinic_id, 'admin') or a.professional_id in (select private.my_professional_ids())) then
    raise exception 'Somente o profissional da sessão ou o administrador pode registrar a evolução';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 5) then raise exception 'Nível deve ser de 1 a 5'; end if;

  insert into public.session_evolutions (clinic_id, appointment_id, professional_id, level, notes)
  values (a.clinic_id, a.id, a.professional_id, p_level, nullif(trim(p_notes), ''))
  on conflict (appointment_id) do update
    set level = excluded.level, notes = excluded.notes, updated_at = now();

  select exists (select 1 from public.appointment_attendees where appointment_id = a.id and status = 'presente') into v_any_present;
  for t in
    select patient_id from public.appointment_attendees
     where appointment_id = a.id
       and (case when v_any_present then status = 'presente'
                 else status::text in ('agendado', 'confirmado') end)
  loop
    ind := (select x from jsonb_array_elements(coalesce(p_individual, '[]'::jsonb)) x where x->>'patient_id' = t.patient_id::text limit 1);
    v_level := coalesce(nullif(ind->>'level', '')::smallint, p_level);
    v_note := nullif(trim(coalesce(ind->>'note', '')), '');
    insert into public.patient_evolutions (clinic_id, appointment_id, patient_id, level, note)
    values (a.clinic_id, a.id, t.patient_id, v_level, v_note)
    on conflict (appointment_id, patient_id) do update
      set level = excluded.level, note = excluded.note, updated_at = now();
    v_count := v_count + 1;
  end loop;

  -- Quem saiu da sessão (desmarcou/faltou) deixa de ter esta evolução
  update public.patient_evolutions pe set level = null, note = null, updated_at = now()
   where pe.appointment_id = a.id
     and not exists (select 1 from public.appointment_attendees t2 where t2.appointment_id = a.id and t2.patient_id = pe.patient_id
                       and (case when v_any_present then t2.status = 'presente' else t2.status::text in ('agendado', 'confirmado') end))
     and (pe.level is not null or pe.note is not null);
  return v_count;
end $$;

revoke execute on function public.save_session_evolution(uuid, smallint, text, jsonb) from public, anon;
grant execute on function public.save_session_evolution(uuid, smallint, text, jsonb) to authenticated;
