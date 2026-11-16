-- Durique · Carnê-Leão (código de ocupação) e Wellhub/TotalPass

alter table public.clinic_settings
  add column carne_leao_ocupacao text check (carne_leao_ocupacao ~ '^[0-9]{3}$'),
  add column wellhub_enabled boolean not null default false,
  add column wellhub_gym_id text check (length(wellhub_gym_id) <= 40),
  add column wellhub_value_cents integer check (wellhub_value_cents >= 0),
  add column totalpass_enabled boolean not null default false,
  add column totalpass_id text check (length(totalpass_id) <= 40),
  add column totalpass_value_cents integer check (totalpass_value_cents >= 0);

-- Por onde o aluno vem: particular (null), Wellhub ou TotalPass
alter table public.patients add column access_via text check (access_via in ('wellhub', 'totalpass'));
create index on public.patients (clinic_id, access_via) where access_via is not null;
