-- 1) Funções de autorização fora da API (schema privado, não exposto pelo PostgREST)
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.current_role_in(uuid) set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.has_role(uuid, public.member_role[]) set schema private;
alter function public.my_professional_ids() set schema private;
alter function public.check_appointment_capacity() set schema private;
alter function public.touch_attendee_status() set schema private;

-- corpos referenciam public.current_role_in → recriar apontando para private
create or replace function private.is_member(p_clinic uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.current_role_in(p_clinic) is not null $$;

create or replace function private.has_role(p_clinic uuid, variadic p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_role_in(p_clinic) = any(p_roles), false) $$;

-- 2) Uma política permissiva por ação (substitui as "for all")
drop policy series_write on public.recurring_series;
create policy series_insert on public.recurring_series for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy series_update on public.recurring_series for update to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy series_delete on public.recurring_series for delete to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao'));

drop policy enrollments_write on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy enrollments_update on public.enrollments for update to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy enrollments_delete on public.enrollments for delete to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao'));

drop policy appointments_write on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy appointments_update on public.appointments for update to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy appointments_delete on public.appointments for delete to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao'));

drop policy attendees_write on public.appointment_attendees;
drop policy attendees_update_prof on public.appointment_attendees;
create policy attendees_insert on public.appointment_attendees for insert to authenticated with check (private.has_role(clinic_id, 'admin', 'recepcao'));
create policy attendees_update on public.appointment_attendees for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')
         or exists (select 1 from public.appointments a where a.id = appointment_id and a.professional_id in (select private.my_professional_ids())))
  with check (private.has_role(clinic_id, 'admin', 'recepcao')
         or exists (select 1 from public.appointments a where a.id = appointment_id and a.professional_id in (select private.my_professional_ids())));
create policy attendees_delete on public.appointment_attendees for delete to authenticated using (private.has_role(clinic_id, 'admin', 'recepcao'));

drop policy patients_select_staff on public.patients;
drop policy patients_select_prof on public.patients;
create policy patients_select on public.patients for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro')
         or exists (select 1 from public.appointment_attendees t
                    join public.appointments a on a.id = t.appointment_id
                    where t.patient_id = patients.id
                      and a.professional_id in (select private.my_professional_ids())));

-- 3) Profissional só altera o status de presença, nada mais
create function private.guard_attendee_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role(old.clinic_id, 'admin', 'recepcao')
     and (new.appointment_id, new.patient_id, new.enrollment_id, new.is_makeup, new.clinic_id)
         is distinct from (old.appointment_id, old.patient_id, old.enrollment_id, old.is_makeup, old.clinic_id) then
    raise exception 'Profissional só pode alterar o status de presença';
  end if;
  return new;
end $$;
create trigger appointment_attendees_guard
before update on public.appointment_attendees
for each row execute function private.guard_attendee_update();

revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_role_in(uuid), private.is_member(uuid),
  private.has_role(uuid, public.member_role[]), private.my_professional_ids() to authenticated;

-- 4) Índices das chaves estrangeiras compostas (clinic_id, x_id)
create index on public.appointment_attendees (clinic_id, appointment_id);
create index on public.appointment_attendees (clinic_id, enrollment_id);
create index on public.appointment_attendees (clinic_id, patient_id);
create index on public.appointments (clinic_id, professional_id);
create index on public.appointments (clinic_id, series_id);
create index on public.appointments (clinic_id, service_id);
create index on public.appointments (clinic_id, unit_id);
create index on public.enrollments (clinic_id, patient_id);
create index on public.enrollments (clinic_id, series_id);
create index on public.professionals (clinic_id, member_id);
create index on public.recurring_series (clinic_id, professional_id);
create index on public.recurring_series (clinic_id, service_id);
create index on public.recurring_series (clinic_id, unit_id);
