-- Durique · Marca da clínica nas páginas públicas por link (documento e pré-avaliação)
-- Devolve só dados públicos da clínica (nome, logo, cor, frase, endereço) a partir do token do link.
create function public.public_brand(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('name', c.name, 'logo', c.logo_url, 'color', c.brand_color, 'tagline', c.tagline, 'address', c.address)
    from public.clinics c
   where length(coalesce(p_token, '')) >= 32
     and c.id = coalesce(
       (select d.clinic_id from public.patient_documents d where d.token = p_token),
       (select pa.clinic_id from public.pre_assessments pa where pa.token = p_token))
$$;
revoke execute on function public.public_brand(text) from public;
grant execute on function public.public_brand(text) to anon, authenticated;
