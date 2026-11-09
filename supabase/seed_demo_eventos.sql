-- Dados de demonstração do CRM de Eventos (datas relativas a hoje). Correr uma vez; ignora se já houver mais de 3 leads.
-- Se ainda não aplicou 0014_lead_source.sql, o campo "origem" é simplesmente ignorado.
do $$
declare has_source boolean := exists (select 1 from information_schema.columns where table_name = 'event_leads' and column_name = 'source');
begin
  if (select count(*) from event_leads) > 3 then
    raise notice 'Já existem leads: nada a fazer.';
    return;
  end if;

  insert into event_leads(name, phone, email, event_type, desired_date, guests, budget, stage)
  select t.name, t.phone, t.email, t.etype, current_date + t.d, t.guests, t.budget, t.stage::lead_stage
  from (values
    ('Ana & Pedro','923100101','ana.pedro@exemplo.ao','Casamento', 75, 220, 4500000,'novo'),
    ('Carlos Mendes','923100102','carlos@exemplo.ao','Aniversário', 12, 80, 900000,'novo'),
    ('Sonangol','923100103','eventos@sonangol.ao','Corporativo', 40, 150, 2400000,'contactado'),
    ('Mariana Costa','923100104',null,'Batizado', 22, 60, 700000,'novo'),
    ('João & Helena','923100105','jh@exemplo.ao','Casamento', 55, 260, 5200000,'negociacao'),
    ('TotalEnergies','923100106','conf@total.ao','Corporativo', 28, 120, 3100000,'visita'),
    ('Sofia Almeida','923100107',null,'Infantil', 18, 50, 650000,'negociacao'),
    ('Ministério das Pescas','923100108','gabinete@pescas.ao','Corporativo', 33, 180, 3800000,'negociacao'),
    ('Luís & Marta','923100109','lm@exemplo.ao','Casamento', 90, 300, 6200000,'proposta'),
    ('Unitel','923100110','eventos@unitel.ao','Corporativo', 37, 140, 2900000,'proposta'),
    ('Helena Marques','923100111',null,'Aniversário', 47, 100, 1300000,'proposta'),
    ('BFA','923100112','eventos@bfa.ao','Corporativo', 20, 90, 1900000,'proposta'),
    ('Daniel & Sara','923100113','ds@exemplo.ao','Casamento', 15, 240, 4800000,'contrato'),
    ('Banco BAI','923100114','bai@exemplo.ao','Corporativo', 13, 110, 2200000,'pagamento'),
    ('Endiama','923100115','endiama@exemplo.ao','Corporativo', 26, 130, 2600000,'confirmado'),
    ('Universidade do Namibe','923100116','uni@exemplo.ao','Corporativo', 31, 160, 2500000,'contrato'),
    ('Ricardo & Elisa','923100117','re@exemplo.ao','Casamento', -20, 280, 5600000,'realizado'),
    ('Angola LNG','923100118','lng@exemplo.ao','Corporativo', -34, 120, 3300000,'realizado'),
    ('Tiago Santos','923100119',null,'Infantil', -12, 45, 600000,'posvenda'),
    ('Governo Provincial','923100120','gov@exemplo.ao','Corporativo', -41, 200, 3900000,'realizado'),
    ('Rui Fernandes','923100121',null,'Aniversário', 8, 70, 800000,'perdido')
  ) as t(name, phone, email, etype, d, guests, budget, stage);

  if has_source then
    update event_leads set source = (array['Website','Instagram','Indicação','Google','Outros'])[1 + (abs(hashtext(name)) % 5)] where source is null;
  end if;
  raise notice 'Leads de demonstração criados.';
end $$;
