alter table venue_reservations add column price numeric(14,2) not null default 0 check (price >= 0);

create table event_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references venue_reservations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method payment_method not null default 'transferencia',
  reference text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table event_payments enable row level security;
create policy evpay_read on event_payments for select to authenticated using (current_role_name() is not null);
create policy evpay_write on event_payments for all to authenticated using (has_role('eventos','financeiro')) with check (has_role('eventos','financeiro'));
create trigger audit_evpay after insert or update or delete on event_payments for each row execute function log_change();

create view reservation_summary with (security_invoker = true) as
select r.*, coalesce(sum(p.amount), 0) as paid_total
from venue_reservations r left join event_payments p on p.reservation_id = r.id
group by r.id;

-- Pagamento do evento: avança o lead e confirma a reserva quando totalmente pago
create or replace function trg_event_payment_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare r venue_reservations; tot numeric;
begin
  select * into r from venue_reservations where id = new.reservation_id;
  select coalesce(sum(amount), 0) into tot from event_payments where reservation_id = r.id;
  if r.price > 0 and tot >= r.price then
    update venue_reservations set status = 'confirmada' where id = r.id and status = 'pendente';
    update event_leads set stage = 'confirmado' where id = r.lead_id and stage < 'confirmado';
  elsif tot > 0 then
    update event_leads set stage = 'pagamento' where id = r.lead_id and stage < 'pagamento';
  end if;
  return new;
end $$;
create trigger event_payments_after_insert after insert on event_payments
  for each row execute function trg_event_payment_apply();

-- Lead -> reserva: ao criar uma reserva ligada a um lead, o lead passa a 'reserva'
create or replace function trg_reservation_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update event_leads set stage = 'reserva' where id = new.lead_id and stage < 'reserva';
  return new;
end $$;
create trigger reservations_after_insert_lead after insert on venue_reservations
  for each row when (new.lead_id is not null) execute function trg_reservation_lead();
