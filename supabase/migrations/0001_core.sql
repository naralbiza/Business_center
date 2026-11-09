-- Business Center Esperança — núcleo: utilizadores, empresas, escritórios, contratos, parcelas, pagamentos, dívidas, notificações
create extension if not exists "pgcrypto";

-- ───────── Enums ─────────
create type app_role as enum ('super_admin','financeiro','eventos','rh','operador');
create type office_status as enum ('livre','reservado','ocupado','manutencao','bloqueado');
create type contract_status as enum ('ativo','a_terminar','expirado','cancelado');
create type periodicity as enum ('mensal','trimestral','semestral','anual','personalizado');
create type installment_status as enum ('pendente','paga','parcial','em_atraso','cancelada');
create type payment_method as enum ('transferencia','numerario','multicaixa','cheque','outro');
create type notification_kind as enum ('fatura_a_vencer','fatura_vence_hoje','pagamento_atrasado','contrato_a_expirar','imposto','evento','sistema');
create type tax_kind as enum ('imposto_ip','imposto_selo','outro');

-- ───────── Utilizadores e permissões ─────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'operador',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function current_role_name() returns app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function has_role(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(current_role_name() = 'super_admin' or current_role_name() = any(roles), false) $$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────── Empresas ─────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  nif text unique,
  sector text,
  phone text, email text, website text,
  address text, province text, municipality text,
  legal_rep_name text, legal_rep_role text, legal_rep_phone text, legal_rep_email text,
  bank text, iban text,
  notes text,
  created_at timestamptz not null default now()
);

-- ───────── Escritórios ─────────
create table offices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  number text not null,
  floor int not null,
  block text,
  area_m2 numeric(8,2) not null check (area_m2 > 0),
  status office_status not null default 'livre',
  monthly_value numeric(14,2),
  deposit numeric(14,2),
  created_at timestamptz not null default now()
);

-- Campos dinâmicos ("+ Adicionar informação")
create table office_custom_fields (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  kind text not null default 'campo' check (kind in ('contacto','documento','pessoa','observacao','campo')),
  label text not null,
  value text,
  created_at timestamptz not null default now()
);

-- ───────── Contratos ─────────
create sequence contract_seq;
create table contracts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('CTR-' || extract(year from now())::int || '-' || lpad(nextval('contract_seq')::text, 4, '0')),
  office_id uuid not null references offices(id),
  company_id uuid not null references companies(id),
  start_date date not null,
  end_date date not null,
  total_value numeric(14,2) not null check (total_value >= 0),
  installments_count int not null check (installments_count > 0),
  periodicity periodicity not null default 'mensal',
  due_day int not null default 25 check (due_day between 1 and 28),
  alert_days_before int not null default 3,
  status contract_status not null default 'ativo',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index on contracts(office_id);
create index on contracts(company_id);
-- Só um contrato ativo/a terminar por escritório
create unique index one_live_contract_per_office on contracts(office_id) where status in ('ativo','a_terminar');

create table installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  seq int not null,
  due_date date not null,
  amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  status installment_status not null default 'pendente',
  unique (contract_id, seq)
);
create index on installments(due_date, status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references installments(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method payment_method not null default 'transferencia',
  reference text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Gera parcelas automaticamente (valor dividido; última parcela absorve arredondamento)
create or replace function generate_installments(p_contract uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c contracts; step interval; base numeric; first_due date; i int;
begin
  select * into c from contracts where id = p_contract;
  step := case c.periodicity when 'mensal' then interval '1 month' when 'trimestral' then interval '3 months'
          when 'semestral' then interval '6 months' when 'anual' then interval '1 year'
          else (((c.end_date - c.start_date)::numeric / c.installments_count) || ' days')::interval end;
  first_due := make_date(extract(year from c.start_date)::int, extract(month from c.start_date)::int, c.due_day);
  if first_due < c.start_date then first_due := first_due + interval '1 month'; end if;
  base := round(c.total_value / c.installments_count, 2);
  delete from installments where contract_id = p_contract and paid_amount = 0;
  for i in 1..c.installments_count loop
    insert into installments(contract_id, seq, due_date, amount)
    values (p_contract, i, (first_due + step * (i - 1))::date,
            case when i = c.installments_count then c.total_value - base * (c.installments_count - 1) else base end)
    on conflict (contract_id, seq) do nothing;
  end loop;
end $$;

create or replace function trg_contract_generate() returns trigger
language plpgsql as $$
begin
  perform generate_installments(new.id);
  update offices set status = 'ocupado' where id = new.office_id;
  return new;
end $$;
create trigger contracts_after_insert after insert on contracts
  for each row execute function trg_contract_generate();

-- Pagamento atualiza parcela
create or replace function trg_payment_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare tot numeric; amt numeric;
begin
  select coalesce(sum(amount),0) into tot from payments where installment_id = new.installment_id;
  select amount into amt from installments where id = new.installment_id;
  update installments set paid_amount = tot,
    status = case when tot >= amt then 'paga' when tot > 0 then 'parcial' else status end
  where id = new.installment_id;
  return new;
end $$;
create trigger payments_after_insert after insert on payments
  for each row execute function trg_payment_apply();

-- ───────── Vistas calculadas ─────────
create view contract_summary as
select c.*,
  coalesce(sum(i.paid_amount),0) as paid_total,
  c.total_value - coalesce(sum(i.paid_amount),0) as remaining_total,
  count(*) filter (where i.status = 'paga') as installments_paid,
  count(*) filter (where i.status <> 'paga' and i.status <> 'cancelada') as installments_missing,
  min(i.due_date) filter (where i.status in ('pendente','parcial','em_atraso')) as next_due_date,
  (c.end_date - current_date) as days_left
from contracts c left join installments i on i.contract_id = c.id
group by c.id;

create view debts as
select i.id as installment_id, c.id as contract_id, c.number, c.company_id, c.office_id,
  i.due_date, i.amount - i.paid_amount as owed,
  greatest(current_date - i.due_date, 0) as days_overdue,
  (i.due_date < current_date) as overdue
from installments i join contracts c on c.id = i.contract_id
where i.status in ('pendente','parcial','em_atraso','parcial') and i.amount > i.paid_amount and c.status <> 'cancelado';

-- Rotina diária (agendar com pg_cron / Edge Function): estados + notificações
create table notifications (
  id uuid primary key default gen_random_uuid(),
  kind notification_kind not null,
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function run_daily_jobs() returns void
language plpgsql security definer set search_path = public as $$
begin
  update installments set status = 'em_atraso' where due_date < current_date and status in ('pendente','parcial');
  update contracts set status = 'expirado' where end_date < current_date and status in ('ativo','a_terminar');
  update contracts set status = 'a_terminar' where status = 'ativo' and end_date - current_date <= 60;
  update offices o set status = 'livre' where o.status = 'ocupado'
    and not exists (select 1 from contracts c where c.office_id = o.id and c.status in ('ativo','a_terminar'));

  insert into notifications(kind,title,body,link,dedupe_key)
  select 'fatura_a_vencer','Fatura a vencer', co.name || ' — vence em ' || to_char(i.due_date,'DD/MM'), '/contratos/' || c.id,
         'inst-soon-' || i.id
  from installments i join contracts c on c.id = i.contract_id join companies co on co.id = c.company_id
  where i.status in ('pendente','parcial') and i.due_date - current_date = c.alert_days_before
  on conflict (dedupe_key) do nothing;

  insert into notifications(kind,title,body,link,dedupe_key)
  select 'pagamento_atrasado','Pagamento em atraso', co.name || ' — ' || (current_date - i.due_date) || ' dias', '/contratos/' || c.id,
         'inst-late-' || i.id || '-' || current_date
  from installments i join contracts c on c.id = i.contract_id join companies co on co.id = c.company_id
  where i.status = 'em_atraso'
  on conflict (dedupe_key) do nothing;

  insert into notifications(kind,title,body,link,dedupe_key)
  select 'contrato_a_expirar','Contrato a expirar', co.name || ' — termina em ' || (c.end_date - current_date) || ' dias', '/contratos/' || c.id,
         'ctr-exp-' || c.id || '-' || (c.end_date - current_date)
  from contracts c join companies co on co.id = c.company_id
  where c.status in ('ativo','a_terminar') and (c.end_date - current_date) in (60,30,7)
  on conflict (dedupe_key) do nothing;
end $$;
-- select cron.schedule('daily-jobs','0 6 * * *','select run_daily_jobs()');

-- ───────── Auditoria ─────────
create table activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(user_id, action, entity, entity_id, detail)
  values (auth.uid(), tg_op, tg_table_name, coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
          case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_companies after insert or update or delete on companies for each row execute function log_change();
create trigger audit_offices after insert or update or delete on offices for each row execute function log_change();
create trigger audit_contracts after insert or update or delete on contracts for each row execute function log_change();
create trigger audit_payments after insert or update or delete on payments for each row execute function log_change();

-- ───────── RLS ─────────
alter table profiles enable row level security;
alter table companies enable row level security;
alter table offices enable row level security;
alter table office_custom_fields enable row level security;
alter table contracts enable row level security;
alter table installments enable row level security;
alter table payments enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_admin on profiles for all to authenticated using (has_role('super_admin')) with check (has_role('super_admin'));

-- Leitura: qualquer utilizador ativo. Escrita: super_admin e financeiro.
do $$
declare t text;
begin
  foreach t in array array['companies','offices','office_custom_fields','contracts','installments','payments'] loop
    execute format('create policy %I_read on %I for select to authenticated using (current_role_name() is not null)', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (has_role(''financeiro'')) with check (has_role(''financeiro''))', t, t);
  end loop;
end $$;

create policy notif_read on notifications for select to authenticated using (current_role_name() is not null);
create policy notif_update on notifications for update to authenticated using (current_role_name() is not null);
create policy logs_read on activity_logs for select to authenticated using (has_role('super_admin'));
