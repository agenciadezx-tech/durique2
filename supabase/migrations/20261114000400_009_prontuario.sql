-- Durique · Prontuário fisioterapêutico (Res. COFFITO 414/2012), escalas, termos com assinatura e LGPD
create type public.record_kind as enum ('avaliacao', 'evolucao', 'adendo');
create type public.document_status as enum ('pendente', 'assinado', 'cancelado');

-- Nº do CREFITO do profissional (obrigatório na identificação do registro)
alter table public.professionals add column crefito text;

-- ===== Registros clínicos: avaliação, evolução por sessão e adendos =====
create table public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  professional_id uuid not null,
  kind public.record_kind not null,
  attendee_id uuid,                       -- evolução ligada à sessão
  parent_id uuid,                         -- adendo corrige/complementa um registro assinado
  record_date date not null default current_date,
  -- Avaliação (COFFITO 414: história clínica, exame físico/funcional, diagnóstico, prognóstico, plano)
  queixa_principal text,
  historia_doenca text,
  antecedentes text,
  medicamentos text,
  exame_fisico text,
  exames_complementares text,
  diagnostico text,
  prognostico text,
  objetivos text,
  plano_terapeutico text,
  -- Evolução (SOAP simplificado)
  subjetivo text,
  conduta text,
  resposta text,
  intercorrencias text,
  -- Comuns
  dor_eva smallint check (dor_eva between 0 and 10),
  mapa_dor jsonb,                         -- [{regiao, lado, intensidade}]
  texto text,                             -- adendo / observações livres
  signed_at timestamptz,
  signed_by uuid,
  signature_hash text,                    -- sha256 do conteúdo no momento da assinatura
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id),
  check (kind <> 'adendo' or parent_id is not null),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id),
  foreign key (clinic_id, parent_id) references public.clinical_records(clinic_id, id)
);
create index on public.clinical_records (clinic_id, patient_id, record_date desc);
create index on public.clinical_records (clinic_id, professional_id);
create index on public.clinical_records (clinic_id, parent_id);
create index on public.clinical_records (attendee_id);

-- ===== Quem pode ver conteúdo clínico =====
-- Admin, ou profissional que atende/atendeu o paciente ou é autor de registro dele.
-- Recepção e financeiro NÃO veem prontuário (LGPD: necessidade).
create function private.can_see_clinical(p_clinic uuid, p_patient uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_role(p_clinic, 'admin')
      or (private.has_role(p_clinic, 'profissional') and (
            exists (select 1 from public.appointment_attendees t
                      join public.appointments a on a.id = t.appointment_id
                     where t.patient_id = p_patient
                       and a.professional_id in (select private.my_professional_ids()))
         or exists (select 1 from public.clinical_records r
                     where r.patient_id = p_patient
                       and r.professional_id in (select private.my_professional_ids()))))
$$;

-- Registro assinado não muda nunca mais (correção = adendo). Nada é apagado.
create function private.guard_clinical_record()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Registros do prontuário não podem ser apagados. Use um adendo.';
  end if;
  if old.signed_at is not null then
    raise exception 'Registro assinado não pode ser alterado. Use um adendo para corrigir.';
  end if;
  if old.professional_id not in (select private.my_professional_ids()) then
    raise exception 'Só quem escreveu pode editar o rascunho.';
  end if;
  -- campos de assinatura só mudam pela função sign_clinical_record
  if (new.signed_at, new.signed_by, new.signature_hash) is distinct from (old.signed_at, old.signed_by, old.signature_hash)
     and coalesce(current_setting('durique.signing', true), '') <> 'on' then
    raise exception 'Use o botão Assinar.';
  end if;
  if new.patient_id <> old.patient_id or new.professional_id <> old.professional_id or new.clinic_id <> old.clinic_id then
    raise exception 'Não é possível mudar paciente ou profissional de um registro.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger clinical_records_guard
before update or delete on public.clinical_records
for each row execute function private.guard_clinical_record();

-- Assinatura eletrônica avançada: autor logado, conteúdo congelado, hash e carimbo de tempo
create function public.sign_clinical_record(p_record uuid)
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
             v_at), 'sha256'), 'hex')
   where id = p_record;
  perform set_config('durique.signing', 'off', true);
  return v_at;
end $$;

-- ===== Escalas e questionários (resultado) =====
create table public.scale_results (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  professional_id uuid,
  scale text not null,                    -- 'eva', 'oswestry', 'ndi', 'roland_morris', 'dash', 'lysholm', 'lefs', 'spadi', 'psfs', 'outra'
  score numeric(6,2) not null,
  max_score numeric(6,2),
  answers jsonb,
  notes text,
  measured_on date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, professional_id) references public.professionals(clinic_id, id)
);
create index on public.scale_results (clinic_id, patient_id, scale, measured_on);
create index on public.scale_results (clinic_id, professional_id);

-- ===== Log de acesso ao prontuário (LGPD) =====
create table public.record_access_log (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  user_id uuid not null default auth.uid(),
  action text not null default 'visualizou',
  created_at timestamptz not null default now()
);
create index on public.record_access_log (clinic_id, patient_id, created_at desc);

create function public.log_record_access(p_patient uuid, p_action text default 'visualizou')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid;
begin
  select clinic_id into v_clinic from public.patients where id = p_patient;
  if v_clinic is null or not private.can_see_clinical(v_clinic, p_patient) then return; end if;
  insert into public.record_access_log (clinic_id, patient_id, action) values (v_clinic, p_patient, left(p_action, 40));
end $$;

-- ===== Termos e contratos com assinatura na tela =====
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);

create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  template_id uuid,
  title text not null,
  body text not null,                    -- texto final, já preenchido
  status public.document_status not null default 'pendente',
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'), -- link para o paciente assinar
  signer_name text,
  signature_png text,                    -- assinatura desenhada (data URL)
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  content_hash text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, template_id) references public.document_templates(clinic_id, id) on delete set null (template_id)
);
create index on public.patient_documents (clinic_id, patient_id);
create index on public.patient_documents (clinic_id, template_id);

create function private.guard_patient_document()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Documentos não podem ser apagados. Cancele o documento.'; end if;
  if old.status = 'assinado' then raise exception 'Documento assinado não pode ser alterado.'; end if;
  return new;
end $$;
create trigger patient_documents_guard
before update or delete on public.patient_documents
for each row execute function private.guard_patient_document();

-- Página pública de assinatura (sem login): lê e assina pelo token
create function public.get_document_by_token(p_token text)
returns table (title text, body text, status public.document_status, clinic_name text, patient_name text, signed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select d.title, d.body, d.status, c.name, p.name, d.signed_at
    from public.patient_documents d
    join public.clinics c on c.id = d.clinic_id
    join public.patients p on p.id = d.patient_id
   where d.token = p_token and length(p_token) >= 32 and d.status <> 'cancelado'
$$;

create function public.sign_document_by_token(p_token text, p_signer_name text, p_signature_png text,
                                              p_ip text default null, p_user_agent text default null)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare d public.patient_documents; v_at timestamptz := now();
begin
  if length(coalesce(p_token, '')) < 32 then raise exception 'Link inválido'; end if;
  select * into d from public.patient_documents where token = p_token for update;
  if not found or d.status = 'cancelado' then raise exception 'Documento não encontrado'; end if;
  if d.status = 'assinado' then return d.signed_at; end if;
  if length(trim(coalesce(p_signer_name, ''))) < 3 then raise exception 'Informe o nome completo'; end if;
  if coalesce(p_signature_png, '') not like 'data:image/png;base64,%' or length(p_signature_png) > 400000 then
    raise exception 'Assinatura inválida';
  end if;
  update public.patient_documents
     set status = 'assinado', signer_name = trim(p_signer_name), signature_png = p_signature_png,
         signed_at = v_at, signed_ip = left(p_ip, 64), signed_user_agent = left(p_user_agent, 300),
         content_hash = encode(extensions.digest(concat_ws('|', d.id, d.body, trim(p_signer_name), v_at), 'sha256'), 'hex')
   where id = d.id;
  return v_at;
end $$;

-- Modelos padrão: consentimento LGPD, uso de imagem e contrato de pacote
create function private.seed_document_templates(p_clinic uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.document_templates (clinic_id, name, body) values
  (p_clinic, 'Consentimento de tratamento e dados (LGPD)',
   'Eu, {paciente}, CPF {cpf}, autorizo a {clinica} a realizar avaliação e tratamento fisioterapêutico e a registrar meus dados de saúde em prontuário eletrônico, que serão usados exclusivamente para meu atendimento, guardados com sigilo pelo prazo legal e não serão compartilhados sem minha autorização, salvo obrigação legal. Também autorizo receber lembretes e avisos de agenda e pagamento pelo WhatsApp informado. Posso pedir acesso, correção ou cópia dos meus dados a qualquer momento.' || chr(10) || chr(10) || '{cidade}, {data}.'),
  (p_clinic, 'Autorização de uso de imagem',
   'Eu, {paciente}, CPF {cpf}, autorizo a {clinica} a registrar fotos e vídeos durante minha avaliação e tratamento, para acompanhamento da evolução clínica. As imagens ficam no meu prontuário e não serão divulgadas sem nova autorização por escrito.' || chr(10) || chr(10) || '{cidade}, {data}.'),
  (p_clinic, 'Contrato de pacote / plano',
   'Contratante: {paciente}, CPF {cpf}.' || chr(10) || 'Contratada: {clinica}.' || chr(10) || chr(10) || 'O(a) contratante adquire o serviço descrito na ficha da clínica, nas condições de valor e validade ali registradas. Desmarcações com pelo menos 12 horas de antecedência geram direito a reposição dentro da validade; faltas e desmarcações em cima da hora contam como sessão realizada. O cancelamento pode ser pedido a qualquer momento, com devolução proporcional das sessões não utilizadas, descontadas as já realizadas.' || chr(10) || chr(10) || '{cidade}, {data}.')
  on conflict do nothing;
$$;
revoke execute on function private.seed_document_templates(uuid) from public, anon, authenticated;
select private.seed_document_templates(id) from public.clinics;

create or replace function public.create_clinic(p_name text, p_unit_name text default 'Unidade principal')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'não autenticado';
  end if;
  insert into public.clinics (name) values (p_name) returning id into v_clinic;
  insert into public.units (clinic_id, name) values (v_clinic, p_unit_name);
  insert into public.members (clinic_id, user_id, role) values (v_clinic, (select auth.uid()), 'admin');
  perform private.seed_categories(v_clinic);
  insert into public.whatsapp_settings (clinic_id) values (v_clinic);
  perform private.seed_document_templates(v_clinic);
  return v_clinic;
end $$;

-- ===== Permissões =====
revoke execute on function private.can_see_clinical(uuid, uuid), private.guard_clinical_record(),
  private.guard_patient_document() from public, anon;
grant execute on function private.can_see_clinical(uuid, uuid) to authenticated;
revoke execute on function public.sign_clinical_record(uuid), public.log_record_access(uuid, text) from public, anon;
grant execute on function public.sign_clinical_record(uuid), public.log_record_access(uuid, text) to authenticated;
revoke execute on function public.get_document_by_token(text), public.sign_document_by_token(text, text, text, text, text) from public;
grant execute on function public.get_document_by_token(text), public.sign_document_by_token(text, text, text, text, text) to anon, authenticated;

alter table public.clinical_records enable row level security;
alter table public.scale_results enable row level security;
alter table public.record_access_log enable row level security;
alter table public.document_templates enable row level security;
alter table public.patient_documents enable row level security;

create policy records_select on public.clinical_records for select to authenticated
  using (private.can_see_clinical(clinic_id, patient_id));
create policy records_insert on public.clinical_records for insert to authenticated
  with check (professional_id in (select private.my_professional_ids()) and private.is_member(clinic_id));
create policy records_update on public.clinical_records for update to authenticated
  using (professional_id in (select private.my_professional_ids()))
  with check (professional_id in (select private.my_professional_ids()));

create policy scales_select on public.scale_results for select to authenticated
  using (private.can_see_clinical(clinic_id, patient_id));
create policy scales_insert on public.scale_results for insert to authenticated
  with check (private.can_see_clinical(clinic_id, patient_id) or
              (private.has_role(clinic_id, 'profissional', 'admin') and private.is_member(clinic_id)));

create policy access_log_select on public.record_access_log for select to authenticated
  using (private.has_role(clinic_id, 'admin'));

create policy doc_templates_select on public.document_templates for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'profissional'));
create policy doc_templates_insert on public.document_templates for insert to authenticated
  with check (private.has_role(clinic_id, 'admin'));
create policy doc_templates_update on public.document_templates for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

create policy patient_docs_select on public.patient_documents for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao') or private.can_see_clinical(clinic_id, patient_id));
create policy patient_docs_insert on public.patient_documents for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao', 'profissional'));
create policy patient_docs_update on public.patient_documents for update to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao')) with check (private.has_role(clinic_id, 'admin', 'recepcao'));
