-- Durique · Avisos automáticos do WhatsApp: cada aviso liga/desliga e tem texto próprio; janela de envio

alter table public.whatsapp_settings
  add column send_from smallint not null default 8 check (send_from between 0 and 23),
  add column send_to smallint not null default 20 check (send_to between 1 and 24);
alter table public.whatsapp_settings add constraint wa_window_ck check (send_to > send_from);

create table public.whatsapp_automations (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  enabled boolean not null default true,
  template text check (length(template) between 10 and 1000),  -- vazio = texto padrão do Durique
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);
alter table public.whatsapp_automations enable row level security;
create policy wa_auto_select on public.whatsapp_automations for select to authenticated using (private.is_member(clinic_id));
create policy wa_auto_insert on public.whatsapp_automations for insert to authenticated with check (private.has_role(clinic_id, 'admin'));
create policy wa_auto_update on public.whatsapp_automations for update to authenticated
  using (private.has_role(clinic_id, 'admin')) with check (private.has_role(clinic_id, 'admin'));
