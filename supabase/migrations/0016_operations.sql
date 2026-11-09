-- Operações: equipamentos, custos operacionais e plano preventivo. Só acrescenta; não altera dados existentes.
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  category text not null default 'Equipamento',
  location text,
  status text not null default 'operacional' check (status in ('operacional', 'manutencao', 'inativo', 'fora_servico')),
  supplier_id uuid references suppliers(id) on delete set null,
  acquired_at date,
  value numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists operational_costs (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null default 'outros' check (category in ('manutencao', 'compras', 'servicos', 'energia', 'outros')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  supplier_id uuid references suppliers(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists operational_costs_date on operational_costs(spent_on);

create table if not exists maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  title text not null,
  every_days int not null default 30 check (every_days > 0),
  next_due date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table suppliers
  add column if not exists rating int check (rating between 1 and 5),
  add column if not exists status text not null default 'ativo' check (status in ('ativo', 'avaliacao', 'inativo'));
alter table maintenance_tickets add column if not exists equipment_id uuid references equipment(id) on delete set null;

alter table equipment enable row level security;
alter table operational_costs enable row level security;
alter table maintenance_plans enable row level security;
do $$
declare t text;
begin
  foreach t in array array['equipment', 'operational_costs', 'maintenance_plans'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (current_role_name() is not null)', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (has_role(''financeiro'',''eventos'')) with check (has_role(''financeiro'',''eventos''))', t, t);
  end loop;
end $$;
