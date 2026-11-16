-- Durique · Resumo de uma linha do paciente (ex.: "Lombalgia crônica · quer voltar a correr")
alter table public.patients add column summary text check (length(summary) <= 140);
