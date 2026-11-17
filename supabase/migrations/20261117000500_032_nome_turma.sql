-- Durique · Turma com nome próprio (ex.: "Pilates Iniciante manhã")
alter table public.recurring_series add column name text check (length(trim(name)) between 1 and 60);
