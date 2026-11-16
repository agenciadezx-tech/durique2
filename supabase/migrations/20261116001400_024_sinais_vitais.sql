-- Durique · Sinais vitais na avaliação (peso, altura, pressão, frequência cardíaca); IMC é calculado na tela

alter table public.clinical_records
  add column peso_kg numeric(5,1) check (peso_kg between 1 and 400),
  add column altura_cm numeric(5,1) check (altura_cm between 30 and 250),
  add column pressao text check (pressao ~ '^\d{2,3}/\d{2,3}$'),
  add column freq_cardiaca smallint check (freq_cardiaca between 20 and 250);

-- A assinatura passa a proteger também os sinais vitais (concat_ws ignora nulos: registros antigos mantêm o mesmo conteúdo)
create or replace function public.sign_clinical_record(p_record uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare r public.clinical_records; v_at timestamptz := now();
begin
  select * into r from public.clinical_records where id = p_record for update;
  if not found then raise exception 'Registro não encontrado'; end if;
  if r.signed_at is not null then return r.signed_at; end if;
  if r.professional_id not in (select private.my_professional_ids()) then
    raise exception 'Só o profissional autor pode assinar.';
  end if;
  perform set_config('durique.signing', 'on', true);
  update public.clinical_records
     set signed_at = v_at, signed_by = (select auth.uid()),
         signature_hash = encode(extensions.digest(
           concat_ws('|', r.id, r.patient_id, r.professional_id, r.kind, r.record_date,
             r.queixa_principal, r.historia_doenca, r.antecedentes, r.medicamentos, r.exame_fisico,
             r.exames_complementares, r.diagnostico, r.prognostico, r.objetivos, r.plano_terapeutico,
             r.subjetivo, r.conduta, r.resposta, r.intercorrencias, r.dor_eva, r.mapa_dor::text, r.texto,
             r.peso_kg, r.altura_cm, r.pressao, r.freq_cardiaca,
             v_at), 'sha256'), 'hex')
   where id = p_record;
  perform set_config('durique.signing', 'off', true);
  return v_at;
end $$;
