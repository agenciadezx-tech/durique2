-- Durique · Chave Pix da clínica (Pix copia e cola nas cobranças) e pagamentos em aberto no link do aluno

alter table public.clinic_settings
  add column pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria')),
  add column pix_key text check (length(pix_key) <= 77),
  add column pix_name text check (length(pix_name) <= 25),
  add column pix_city text check (length(pix_city) <= 15);

-- Cobranças em aberto do paciente (link do aluno) + dados do Pix da clínica
create function public.portal_charges(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.patients;
begin
  p := private.portal_patient(p_token);
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'pix', (select case when cs.pix_key is not null and cs.pix_name is not null
                        then jsonb_build_object('key', cs.pix_key, 'name', cs.pix_name, 'city', coalesce(cs.pix_city, 'BRASIL')) end
              from public.clinic_settings cs where cs.clinic_id = p.clinic_id),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'description', x.description, 'amount_cents', x.amount_cents, 'due_date', x.due_date)
                       order by x.due_date)
        from public.transactions x
       where x.patient_id = p.id and x.type = 'receita' and x.paid_on is null and x.due_date <= current_date + 10), '[]'::jsonb));
end $$;

revoke execute on function public.portal_charges(text) from public;
grant execute on function public.portal_charges(text) to anon, authenticated;
