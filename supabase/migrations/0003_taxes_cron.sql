-- Obrigações fiscais (Imposto IP, Imposto de selo mensal...) parametrizáveis
create table tax_obligations (
  id uuid primary key default gen_random_uuid(),
  kind tax_kind not null,
  label text not null,
  competence date not null,          -- 1.º dia do mês de competência
  due_date date not null,
  amount numeric(14,2) not null default 0,
  paid boolean not null default false,
  paid_at date,
  created_at timestamptz not null default now(),
  unique (kind, competence)
);
alter table tax_obligations enable row level security;
create policy tax_read on tax_obligations for select to authenticated using (current_role_name() is not null);
create policy tax_write on tax_obligations for all to authenticated using (has_role('financeiro')) with check (has_role('financeiro'));
create trigger audit_tax after insert or update or delete on tax_obligations for each row execute function log_change();

-- Cria o imposto de selo do mês seguinte e alerta 3 dias antes do prazo
create or replace function run_tax_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', current_date + interval '1 month')::date;
begin
  insert into tax_obligations(kind, label, competence, due_date)
  values ('imposto_selo', 'Imposto de selo — ' || to_char(m, 'MM/YYYY'), m, (m + interval '24 days')::date)
  on conflict (kind, competence) do nothing;

  insert into notifications(kind, title, body, link, dedupe_key)
  select 'imposto', t.label, 'Prazo de pagamento até ' || to_char(t.due_date, 'DD/MM'), '/impostos', 'tax-' || t.id
  from tax_obligations t where not t.paid and t.due_date - current_date between 0 and 3
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function run_daily_jobs_all() returns void
language plpgsql security definer set search_path = public as $$
begin perform run_daily_jobs(); perform run_tax_jobs(); end $$;

-- Agendamento diário (06:00 UTC) com pg_cron, se a extensão estiver disponível
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('daily-jobs', '0 6 * * *', 'select run_daily_jobs_all()');
exception when others then
  raise notice 'pg_cron indisponível: agendar run_daily_jobs_all() manualmente (%).', sqlerrm;
end $$;

insert into tax_obligations(kind, label, competence, due_date, amount, paid, paid_at) values
 ('imposto_selo','Imposto de selo — 09/2026','2026-09-01','2026-09-25',450000,true,'2026-09-24'),
 ('imposto_selo','Imposto de selo — 10/2026','2026-10-01','2026-10-25',480000,false,null),
 ('imposto_ip','Imposto IP — 2026','2026-10-01','2026-10-31',1200000,false,null);
select run_tax_jobs();
