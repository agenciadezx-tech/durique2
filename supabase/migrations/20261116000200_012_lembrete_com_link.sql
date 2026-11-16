-- Lembrete padrão passa a levar o link do aluno ({link}) para confirmar ou desmarcar sozinho
alter table public.whatsapp_settings alter column tpl_lembrete set default
  'Olá, {nome}! Lembrete da sua sessão de {servico} na {clinica}: {dia} às {hora}, com {profissional}. Para confirmar ou desmarcar, toque aqui: {link}';

update public.whatsapp_settings
   set tpl_lembrete = 'Olá, {nome}! Lembrete da sua sessão de {servico} na {clinica}: {dia} às {hora}, com {profissional}. Para confirmar ou desmarcar, toque aqui: {link}'
 where tpl_lembrete = 'Olá, {nome}! Lembrete da sua sessão de {servico} na {clinica}: {dia} às {hora}, com {profissional}. Responda 1 para confirmar ou 2 para remarcar.';
