-- Quem pode ver a ficha clínica de um aluno da sessão também vê o que foi trabalhado na aula
alter policy session_evolutions_select on public.session_evolutions
  using (
    private.has_role(clinic_id, 'admin')
    or professional_id in (select private.my_professional_ids())
    or exists (select 1 from public.patient_evolutions pe
                where pe.appointment_id = session_evolutions.appointment_id
                  and private.can_see_clinical(pe.clinic_id, pe.patient_id))
  );
