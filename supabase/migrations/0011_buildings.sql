-- Edifícios e planta dinâmica dos escritórios.
-- Seguro para dados existentes: só acrescenta tabelas/colunas e distribui os escritórios atuais pelos dois edifícios.

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table buildings enable row level security;
drop policy if exists buildings_read on buildings;
drop policy if exists buildings_write on buildings;
create policy buildings_read on buildings for select to authenticated using (current_role_name() is not null);
create policy buildings_write on buildings for all to authenticated using (has_role('financeiro')) with check (has_role('financeiro'));

insert into buildings(name, code) values ('Edifício 1', 'E1'), ('Edifício 2', 'E2')
on conflict (code) do nothing;

alter table offices
  add column if not exists building_id uuid references buildings(id),
  add column if not exists position_x int not null default 0,
  add column if not exists position_y int not null default 0,
  add column if not exists width int not null default 1,
  add column if not exists height int not null default 1,
  add column if not exists sort_order int not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text;

alter table offices drop constraint if exists offices_size_check;
alter table offices add constraint offices_size_check check (width >= 1 and height >= 1 and position_x >= 0 and position_y >= 0);

-- Distribuição inicial dos escritórios existentes (1.º dígito ímpar -> Edifício 1; par -> Edifício 2), em grelha de 12 colunas
with ranked as (
  select id,
         case when left(number, 1) in ('1', '3', '5', '7', '9') then 'E1' else 'E2' end as bcode,
         row_number() over (partition by case when left(number, 1) in ('1', '3', '5', '7', '9') then 'E1' else 'E2' end order by number) as rn
  from offices where building_id is null
)
update offices o
   set building_id = (select id from buildings b where b.code = r.bcode),
       position_x = (r.rn - 1) % 12,
       position_y = (r.rn - 1) / 12,
       sort_order = r.rn
  from ranked r where o.id = r.id;

-- Um código de escritório é único dentro do edifício
create unique index if not exists offices_building_number_key on offices(building_id, number) where building_id is not null;
create index if not exists offices_building_idx on offices(building_id, is_active);

drop trigger if exists audit_buildings on buildings;
create trigger audit_buildings after insert or update or delete on buildings for each row execute function log_change();
