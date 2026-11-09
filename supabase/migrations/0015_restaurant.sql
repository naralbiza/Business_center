-- Restaurante: mesas e reservas. Só acrescenta tabelas novas.
create table if not exists restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  area text not null default 'Área Principal',
  capacity int not null default 4 check (capacity > 0),
  pos_x numeric(5,2) not null default 20 check (pos_x between 0 and 100),   -- % da largura do mapa
  pos_y numeric(5,2) not null default 20 check (pos_y between 0 and 100),   -- % da altura do mapa
  status text not null default 'livre' check (status in ('livre', 'ocupada', 'reservada', 'preparar', 'bloqueada')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (area, code)
);

create table if not exists restaurant_reservations (
  id uuid primary key default gen_random_uuid(),
  table_id uuid references restaurant_tables(id) on delete set null,
  client text not null,
  phone text,
  party_size int not null default 2 check (party_size > 0),
  starts_at timestamptz not null,
  duration_min int not null default 120 check (duration_min > 0),
  status text not null default 'confirmada' check (status in ('confirmada', 'aguardar', 'a_chegar', 'em_curso', 'concluida', 'cancelada')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists restaurant_res_starts on restaurant_reservations(starts_at);

alter table restaurant_tables enable row level security;
alter table restaurant_reservations enable row level security;
drop policy if exists rest_tables_read on restaurant_tables;
drop policy if exists rest_tables_write on restaurant_tables;
drop policy if exists rest_res_read on restaurant_reservations;
drop policy if exists rest_res_write on restaurant_reservations;
create policy rest_tables_read on restaurant_tables for select to authenticated using (current_role_name() is not null);
create policy rest_tables_write on restaurant_tables for all to authenticated using (has_role('eventos')) with check (has_role('eventos'));
create policy rest_res_read on restaurant_reservations for select to authenticated using (current_role_name() is not null);
create policy rest_res_write on restaurant_reservations for all to authenticated using (has_role('eventos')) with check (has_role('eventos'));

drop trigger if exists audit_rest_res on restaurant_reservations;
create trigger audit_rest_res after insert or update or delete on restaurant_reservations for each row execute function log_change();
