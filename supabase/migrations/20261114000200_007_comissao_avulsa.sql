-- Comissão: sessão avulsa cobrada usa o valor efetivamente cobrado
create or replace function public.commission_report(p_clinic uuid, p_from date, p_to date)
returns table (professional_id uuid, professional_name text, sessions integer,
               base_cents bigint, commission_cents bigint, paid_cents bigint)
language sql stable security invoker set search_path = ''
as $$
  with s as (
    select a.professional_id,
           coalesce(
             case when pk.kind = 'pacote' then pk.price_cents::numeric / nullif(pk.total_sessions, 0) end,
             case when pk.kind = 'plano' then pk.price_cents::numeric / greatest(1, round(pk.sessions_per_week * 52 / 12.0)) end,
             (select sum(x.amount_cents) from public.transactions x where x.attendee_id = t.id and x.type = 'receita')::numeric,
             sv.price_cents::numeric, 0) as value
      from public.appointment_attendees t
      join public.appointments a on a.id = t.appointment_id
      join public.services sv on sv.id = a.service_id
      left join public.patient_packages pk on pk.id = t.package_id
     where a.clinic_id = p_clinic and a.status = 'agendado' and t.status = 'presente'
       and (a.starts_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select pr.id, pr.name, count(s.*)::int,
         coalesce(round(sum(s.value)), 0)::bigint,
         coalesce(round(case when pr.commission_fixed_cents is not null then count(s.*) * pr.commission_fixed_cents
                             else sum(s.value) * coalesce(pr.commission_percent, 0) / 100 end), 0)::bigint,
         (select coalesce(sum(x.amount_cents), 0) from public.transactions x
           where x.clinic_id = p_clinic and x.professional_id = pr.id and x.type = 'despesa'
             and x.due_date between p_from and p_to)::bigint
    from public.professionals pr
    left join s on s.professional_id = pr.id
   where pr.clinic_id = p_clinic and private.has_role(p_clinic, 'admin', 'financeiro')
   group by pr.id, pr.name, pr.commission_fixed_cents, pr.commission_percent, pr.active
  having count(s.*) > 0 or pr.active
   order by pr.name
$$;
create index if not exists transactions_attendee_idx on public.transactions (attendee_id);
