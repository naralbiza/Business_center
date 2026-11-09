alter table venue_reservations add column company_id uuid references companies(id) on delete set null;
update venue_reservations r set company_id = c.id from companies c where r.company_id is null and lower(trim(r.client)) = lower(trim(c.name));

-- recriar a vista para incluir a nova coluna (r.* é fixado na criação)
drop view reservation_summary;
create view reservation_summary with (security_invoker = true) as
select r.*, coalesce(sum(p.amount), 0) as paid_total
from venue_reservations r left join event_payments p on p.reservation_id = r.id
group by r.id;
