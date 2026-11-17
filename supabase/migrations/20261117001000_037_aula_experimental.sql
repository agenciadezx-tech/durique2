-- Aula experimental (grátis ou com valor) e aula avulsa: o aluno entra só naquela aula,
-- sem descontar sessão de pacote/plano. Se tiver valor, vira um lançamento ligado ao aluno da aula.
alter table public.appointment_attendees
  add column if not exists charge_kind text check (charge_kind in ('experimental', 'avulsa'));

comment on column public.appointment_attendees.charge_kind is
  'experimental = aula experimental (grátis ou valor próprio); avulsa = aula paga à parte. Nos dois casos não consome pacote.';

create or replace function private.assign_package()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_service uuid; v_day date; v_pkg uuid;
begin
  if new.charge_kind is not null then
    new.package_id := null; -- experimental/avulsa: nunca usa sessão de pacote
    return new;
  end if;
  if new.status::text in ('presente', 'falta', 'desmarcado_fora_prazo') then
    if new.package_id is null then
      select a.service_id, (a.starts_at at time zone 'America/Sao_Paulo')::date
        into v_service, v_day from public.appointments a where a.id = new.appointment_id;
      select p.id into v_pkg
        from public.patient_packages p
       where p.patient_id = new.patient_id and p.status = 'ativo'
         and (p.service_id is null or p.service_id = v_service)
         and p.starts_on <= v_day and (p.expires_on is null or p.expires_on >= v_day)
         and (p.total_sessions is null or p.total_sessions > (
               select count(*) from public.appointment_attendees t
                where t.package_id = p.id and t.id <> new.id
                  and t.status::text in ('presente', 'falta', 'desmarcado_fora_prazo')))
       order by p.kind = 'plano' desc, p.expires_on nulls last, p.created_at
       limit 1;
      new.package_id := v_pkg;
    end if;
  else
    new.package_id := null; -- desfez a presença: devolve a sessão ao pacote
  end if;
  return new;
end $$;
revoke execute on function private.assign_package() from public, anon, authenticated;
