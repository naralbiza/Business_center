-- Só existe um salão: removemos os espaços de exemplo extra (restaurante fica para mais tarde)
delete from venue_reservations where venue_id in (select id from venues where name <> 'Salão Principal');
delete from venues where name <> 'Salão Principal';
update venues set name = 'Salão de Festas', capacity = coalesce(capacity, 500) where name = 'Salão Principal';

-- RH
create type employee_status as enum ('ativo','ferias','suspenso','desligado');
create table employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  bi text, nif text,
  phone text, email text,
  position text not null,
  department text not null default 'Geral',
  hire_date date,
  contract_type text not null default 'Efetivo',
  salary numeric(14,2),
  status employee_status not null default 'ativo',
  created_at timestamptz not null default now()
);
create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  day date not null default current_date,
  status text not null default 'presente' check (status in ('presente','falta','justificada','ferias')),
  unique (employee_id, day)
);
alter table employees enable row level security;
alter table attendance enable row level security;
create policy emp_rh on employees for all to authenticated using (has_role('rh')) with check (has_role('rh'));
create policy att_rh on attendance for all to authenticated using (has_role('rh')) with check (has_role('rh'));
create trigger audit_employees after insert or update or delete on employees for each row execute function log_change();

insert into employees(full_name, position, department, hire_date, salary) values
 ('Ana Pereira','Recepcionista','Administração','2025-03-01',180000),
 ('Carlos Mendes','Técnico de manutenção','Operações','2024-08-15',220000);
