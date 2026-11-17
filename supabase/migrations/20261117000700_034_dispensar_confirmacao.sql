-- Paciente que não precisa confirmar presença (idosos, alunos fixos): não entra nos lembretes nem no "Em risco".
alter table public.patients add column if not exists skip_confirmation boolean not null default false;
comment on column public.patients.skip_confirmation is 'Dispensado de confirmar presença: fica fora dos lembretes e do alerta Em risco.';
