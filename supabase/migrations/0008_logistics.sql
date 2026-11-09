create type ticket_status as enum ('aberto','em_curso','concluido');

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nif text, phone text, email text,
  category text,
  notes text,
  created_at timestamptz not null default now()
);

create table logistics_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Equipamento',
  quantity numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0,
  unit text not null default 'un',
  location text,
  supplier_id uuid references suppliers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table logistics_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references logistics_items(id) on delete cascade,
  kind text not null check (kind in ('entrada','saida','ajuste')),
  quantity numeric(12,2) not null check (quantity > 0),
  destination text,          -- evento, escritório, salão... (texto livre)
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create or replace function trg_movement_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare q numeric;
begin
  select quantity into q from logistics_items where id = new.item_id for update;
  if new.kind = 'saida' and q < new.quantity then
    raise exception 'Stock insuficiente: existem % e a saída é de %', q, new.quantity using errcode = 'P0001';
  end if;
  update logistics_items set quantity = case new.kind when 'entrada' then quantity + new.quantity when 'saida' then quantity - new.quantity else new.quantity end
  where id = new.item_id;
  return new;
end $$;
create trigger movements_before_insert before insert on logistics_movements
  for each row execute function trg_movement_apply();

create table maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null default 'Edifício',
  office_id uuid references offices(id) on delete set null,
  priority text not null default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  status ticket_status not null default 'aberto',
  supplier_id uuid references suppliers(id) on delete set null,
  cost numeric(14,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
-- Preenche a data de fecho quando o pedido é concluído
create or replace function trg_ticket_office() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluido' and new.closed_at is null then new.closed_at := now(); end if;
  return new;
end $$;
create trigger tickets_before before insert or update on maintenance_tickets for each row execute function trg_ticket_office();

alter table suppliers enable row level security;
alter table logistics_items enable row level security;
alter table logistics_movements enable row level security;
alter table maintenance_tickets enable row level security;
do $$
declare t text;
begin
  foreach t in array array['suppliers','logistics_items','logistics_movements','maintenance_tickets'] loop
    execute format('create policy %I_read on %I for select to authenticated using (current_role_name() is not null)', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (has_role(''financeiro'',''eventos'')) with check (has_role(''financeiro'',''eventos''))', t, t);
  end loop;
end $$;
create trigger audit_items after insert or update or delete on logistics_items for each row execute function log_change();
create trigger audit_tickets after insert or update or delete on maintenance_tickets for each row execute function log_change();

insert into suppliers(name, category, phone) values ('Eventos & Decoração Lda','Decoração','923111222'),('TecnoSom','Som e iluminação','923333444');
insert into logistics_items(name, category, quantity, min_quantity, location, supplier_id)
select 'Cadeiras', 'Mobiliário', 400, 300, 'Armazém', id from suppliers where name like 'Eventos%'
union all select 'Mesas redondas', 'Mobiliário', 45, 50, 'Armazém', id from suppliers where name like 'Eventos%'
union all select 'Colunas de som', 'Som', 6, 4, 'Salão', id from suppliers where name = 'TecnoSom';
insert into maintenance_tickets(title, area, priority) values ('Ar condicionado do Salão com ruído', 'Salão', 'alta');
