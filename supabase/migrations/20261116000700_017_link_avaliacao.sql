-- Durique · Link de avaliação no Google (mostrado a quem dá nota 9 ou 10)
alter table public.clinics add column review_url text check (review_url is null or review_url ~ '^https://');

create function public.portal_review_url(p_token text)
returns text language sql stable security definer set search_path = ''
as $$
  select c.review_url from public.clinics c
   where c.id = (select clinic_id from public.patients where portal_token = p_token and length(p_token) >= 32 and active)
$$;

revoke execute on function public.portal_review_url(text) from public;
grant execute on function public.portal_review_url(text) to anon, authenticated;
