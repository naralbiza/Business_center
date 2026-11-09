-- Dados de demonstração para a página Impostos (datas relativas a hoje).
-- Correr DEPOIS de 0012_tax_types.sql, uma única vez. Não faz nada se já existirem impostos IVA/IAC/IRPC.
do $$
declare
  m date := date_trunc('month', current_date)::date;
  k int; comp date; due date; amt numeric;
begin
  if exists (select 1 from tax_obligations where kind in ('iva', 'iac', 'irpc')) then
    raise notice 'Já existem impostos de demonstração: nada a fazer.';
    return;
  end if;

  -- IVA mensal: dois meses mais antigos em falta/pagos, o último por pagar
  for k in 1..3 loop
    comp := (m - (k || ' months')::interval)::date;
    due := (comp + interval '1 month' + interval '19 days')::date;
    insert into tax_obligations(kind, label, reference, period_label, competence, due_date, amount, paid, paid_at)
    values ('iva', 'IVA Mensal', 'IVA-' || to_char(comp, 'YYYY') || '-' || to_char(comp, 'MM'), initcap(to_char(comp, 'TMMon')) || '/' || to_char(comp, 'YYYY'),
            comp, due, 400000, k = 3, case when k = 3 then due - 2 end);
  end loop;

  -- IAC mensal: tudo pago o que já venceu
  for k in 1..3 loop
    comp := (m - (k || ' months')::interval)::date;
    due := (comp + interval '1 month' + interval '9 days')::date;
    amt := case k when 3 then 290000 else 280000 end;
    insert into tax_obligations(kind, label, reference, period_label, competence, due_date, amount, paid, paid_at)
    values ('iac', 'IAC Mensal', 'IAC-' || to_char(comp, 'YYYY') || '-' || to_char(comp, 'MM'), initcap(to_char(comp, 'TMMon')) || '/' || to_char(comp, 'YYYY'),
            comp, due, amt, due < current_date, case when due < current_date then due - 2 end);
  end loop;

  -- IRPC trimestral
  insert into tax_obligations(kind, label, reference, period_label, competence, due_date, amount, paid, paid_at) values
    ('irpc', 'IRPC Trimestral', 'IRPC-' || extract(year from current_date)::int || '-T3', '3º Trimestre', date_trunc('quarter', current_date)::date, current_date + 17, 800000, false, null),
    ('irpc', 'IRPC Trimestral', 'IRPC-' || extract(year from current_date)::int || '-T2', '2º Trimestre', (date_trunc('quarter', current_date) - interval '3 months')::date, current_date - 75, 200000, true, current_date - 74);

  -- Outros impostos e taxas
  insert into tax_obligations(kind, label, reference, period_label, competence, due_date, amount, paid, paid_at) values
    ('predial', 'Imposto Predial Urbano', 'IPU-' || extract(year from current_date)::int, 'Anual', make_date(extract(year from current_date)::int, 1, 1), make_date(extract(year from current_date)::int, 12, 31), 300000, true, current_date - 28),
    ('taxa', 'Taxa Municipal', 'TM-' || extract(year from current_date)::int, 'Anual', make_date(extract(year from current_date)::int, 1, 1), make_date(extract(year from current_date)::int, 12, 31), 100000, true, current_date - 28);

  -- Declarações em preparação
  insert into tax_obligations(kind, label, reference, period_label, competence, due_date, amount, paid, in_preparation) values
    ('iva', 'IVA Mensal', 'IVA-' || to_char(m, 'YYYY') || '-' || to_char(m, 'MM'), initcap(to_char(m, 'TMMon')) || '/' || to_char(m, 'YYYY'), m, (m + interval '1 month' + interval '19 days')::date, 400000, false, true),
    ('iac', 'IAC Mensal', 'IAC-' || to_char(m, 'YYYY') || '-' || to_char(m, 'MM'), initcap(to_char(m, 'TMMon')) || '/' || to_char(m, 'YYYY'), m, (m + interval '1 month' + interval '9 days')::date, 280000, false, true);

  raise notice 'Impostos de demonstração criados.';
end $$;
