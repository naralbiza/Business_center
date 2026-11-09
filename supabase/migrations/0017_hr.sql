-- Recursos Humanos unificados: datas de contrato, aniversário, horas de entrada/saída e novos estados de presença.
alter table employees
  add column if not exists contract_end date,
  add column if not exists birth_date date;

alter table attendance
  add column if not exists check_in time,
  add column if not exists check_out time;

-- Estados de presença: acrescenta "atraso" e "folga"
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'attendance'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table attendance drop constraint %I', c.conname);
  end loop;
end $$;
alter table attendance
  add constraint attendance_status_check check (status in ('presente', 'atraso', 'falta', 'justificada', 'ferias', 'folga'));

-- Alerta automático de contratos a terminar (30, 15 e 7 dias) — corre com a rotina diária
create or replace function run_hr_jobs() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(kind, title, body, link, dedupe_key)
  select 'sistema', 'Contrato a terminar',
         e.full_name || ' — contrato termina em ' || (e.contract_end - current_date) || ' dias', '/rh',
         'hr-contract-' || e.id || '-' || (e.contract_end - current_date)
  from employees e
  where e.status <> 'desligado' and e.contract_end is not null and (e.contract_end - current_date) in (30, 15, 7, 3, 1)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function run_daily_jobs_all() returns void
language plpgsql security definer set search_path = public as $$
begin perform run_daily_jobs(); perform run_tax_jobs(); perform run_hr_jobs(); end $$;
