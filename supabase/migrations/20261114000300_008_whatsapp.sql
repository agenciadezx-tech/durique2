-- Durique · WhatsApp: configurações, textos e registro de mensagens
create type public.wa_mode as enum ('manual', 'automatico');
create type public.message_kind as enum ('lembrete', 'cobranca', 'renovacao', 'outro');

create table public.whatsapp_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  mode public.wa_mode not null default 'manual',
  instance_id text,                          -- conexão no provedor (modo automático)
  connected boolean not null default false,
  reminder_hours integer[] not null default '{24}',
  tpl_lembrete text not null default
    'Olá, {nome}! Lembrete da sua sessão de {servico} na {clinica}: {dia} às {hora}, com {profissional}. Responda 1 para confirmar ou 2 para remarcar.',
  tpl_cobranca text not null default
    'Olá, {nome}! Tudo bem? Passando para lembrar do pagamento de {descricao}, no valor de {valor}, com vencimento em {vencimento}. Qualquer dúvida é só chamar. {clinica}',
  tpl_renovacao text not null default
    'Olá, {nome}! Restam {restantes} sessões do seu {pacote} na {clinica}. Quer já garantir a renovação para não interromper o tratamento?',
  updated_at timestamptz not null default now()
);

create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind public.message_kind not null,
  channel public.wa_mode not null default 'manual',
  patient_id uuid not null,
  attendee_id uuid,
  transaction_id uuid,
  package_id uuid,
  phone text,
  body text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  foreign key (clinic_id, transaction_id) references public.transactions(clinic_id, id) on delete set null (transaction_id),
  foreign key (clinic_id, package_id) references public.patient_packages(clinic_id, id) on delete set null (package_id)
);
create index on public.message_log (clinic_id, created_at desc);
create index on public.message_log (clinic_id, patient_id);
create index on public.message_log (attendee_id);
create index on public.message_log (clinic_id, transaction_id);
create index on public.message_log (clinic_id, package_id);

-- Configuração padrão para clínicas novas e existentes
insert into public.whatsapp_settings (clinic_id) select id from public.clinics on conflict do nothing;

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
  return v_clinic;
end $$;

alter table public.whatsapp_settings enable row level security;
alter table public.message_log enable row level security;

create policy wa_settings_select on public.whatsapp_settings for select to authenticated
  using (private.is_member(clinic_id));
create policy wa_settings_update on public.whatsapp_settings for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));

create policy message_log_select on public.message_log for select to authenticated
  using (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));
create policy message_log_insert on public.message_log for insert to authenticated
  with check (private.has_role(clinic_id, 'admin', 'recepcao', 'financeiro'));
