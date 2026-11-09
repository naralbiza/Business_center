create extension if not exists btree_gist;

create type lead_stage as enum ('novo','contactado','visita','proposta','negociacao','reserva','contrato','pagamento','confirmado','realizado','posvenda','perdido');
create type reservation_status as enum ('pendente','confirmada','cancelada');

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'salao' check (kind in ('salao','sala','restaurante','exterior')),
  capacity int,
  base_price numeric(14,2)
);

create table event_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text,
  event_type text not null default 'Casamento',
  desired_date date,
  guests int,
  budget numeric(14,2),
  stage lead_stage not null default 'novo',
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table venue_reservations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  lead_id uuid references event_leads(id) on delete set null,
  title text not null,
  client text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  guests int,
  status reservation_status not null default 'pendente',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- impede reservas sobrepostas no mesmo espaço
  constraint no_overlap exclude using gist (venue_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelada')
);
create index on venue_reservations(starts_at);

alter table venues enable row level security;
alter table event_leads enable row level security;
alter table venue_reservations enable row level security;
do $$
declare t text;
begin
  foreach t in array array['venues','event_leads','venue_reservations'] loop
    execute format('create policy %I_read on %I for select to authenticated using (current_role_name() is not null)', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (has_role(''eventos'')) with check (has_role(''eventos''))', t, t);
  end loop;
end $$;
create trigger audit_leads after insert or update or delete on event_leads for each row execute function log_change();
create trigger audit_reservations after insert or update or delete on venue_reservations for each row execute function log_change();

insert into venues(name, kind, capacity, base_price) values
 ('Salão Principal','salao',500,3500000),('Salão VIP','salao',120,1800000),
 ('Sala A','sala',80,600000),('Restaurante','restaurante',60,null);

insert into event_leads(name, phone, event_type, desired_date, guests, budget, stage) values
 ('Maria','923000001','Casamento','2026-12-15',300,5000000,'proposta'),
 ('Empresa XYZ','923000002','Conferência','2026-10-12',80,900000,'contrato'),
 ('João','923000003','Aniversário','2026-11-20',60,700000,'novo');

insert into venue_reservations(venue_id, title, client, starts_at, ends_at, guests, status)
select id, 'Casamento Silva', 'Família Silva', '2026-10-10 18:00+01'::timestamptz, '2026-10-11 02:00+01'::timestamptz, 250, 'confirmada'::reservation_status from venues where name='Salão Principal'
union all
select id, 'Conferência Empresarial', 'Empresa XYZ', '2026-10-12 08:00+01'::timestamptz, '2026-10-12 17:00+01'::timestamptz, 80, 'confirmada'::reservation_status from venues where name='Sala A';
