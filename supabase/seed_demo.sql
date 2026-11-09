-- ═══════════════════════════════════════════════════════════════════════════
-- DADOS DE DEMONSTRAÇÃO (fictícios) para todas as páginas do sistema.
-- Correr UMA vez no SQL Editor DEPOIS de instalar o esquema (setup_all.sql) e da migração 0011_buildings.sql.
-- Datas relativas a hoje. Se já existirem empresas, não faz nada (não duplica nem apaga).
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  cnames text[] := array[
    'Media Solutions','Grupo Santos','Angola Tech Lda','Consultoria ABC','Serviços & Cia','Comercial MZ',
    'Namibe Logística','Atlântico Seguros','Deserto Verde Agro','Horizonte Contabilidade','Welwitschia Advogados',
    'Mar Azul Pescas','Sol Nascente Clínica','Kwanza Engenharia','Moçâmedes Imobiliária','Baía Turismo',
    'Planalto Digital','Safira Design','Dunas Construções','Ouro Negro Energia','Estrela Educação',
    'Nova Era Marketing','Cunene Transportes','Savana Eventos','Litoral Farma','Pérola Estética',
    'Granito Arquitetos','Rota Sul Viagens','Aurora Rádio','Tchioco Consultores'];
  csectors text[] := array[
    'Media','Holding','Tecnologia','Consultoria','Serviços','Comércio','Logística','Seguros','Agricultura','Contabilidade',
    'Advocacia','Pescas','Saúde','Engenharia','Imobiliário','Turismo','Tecnologia','Design','Construção','Energia',
    'Educação','Marketing','Transportes','Eventos','Farmácia','Estética','Arquitetura','Viagens','Media','Consultoria'];
  reps text[] := array['Ana Ferreira','Paulo Gomes','Luísa Neto','Carlos Mendes','Teresa Dias','Manuel Costa','Sofia Pereira','João Lopes','Marta Silva','Rui Fernandes'];
  fl int; k int; i int;
  v_company uuid; v_office uuid; v_area numeric; v_end date; v_off int; v_venue uuid;
begin
  if exists (select 1 from companies) then
    raise notice 'Já existem empresas: dados de demonstração ignorados.';
    return;
  end if;

  -- ── Empresas
  for i in 1..30 loop
    insert into companies(name, nif, sector, phone, email, legal_rep_name, address, province, municipality)
    values (cnames[i], '5400' || lpad(i::text, 6, '0'), csectors[i], '92' || lpad((3000000 + i * 7919)::text, 7, '0'),
            'geral' || i || '@empresa' || i || '.ao', reps[1 + (i % 10)], 'Rua Direita ' || (10 + i) || ', Moçâmedes', 'Namibe', 'Moçâmedes');
  end loop;

  -- ── Escritórios (2 edifícios × 24; requer a migração 0011)
  for fl in 1..2 loop
    for k in 1..24 loop
      v_area := 28 + ((fl * 7 + k * 5) % 33);
      insert into offices(code, number, floor, area_m2, status, monthly_value, building_id, position_x, position_y, sort_order)
      values ('E' || fl || '-' || (fl * 100 + k), (fl * 100 + k)::text, 1, v_area, 'livre', v_area * 12000,
              (select id from buildings where code = 'E' || fl), (k - 1) % 12, (k - 1) / 12, k);
    end loop;
  end loop;

  -- ── Contratos (42 ocupados; o gatilho gera as parcelas e marca o escritório como ocupado)
  for i in 1..42 loop
    select id, area_m2 into v_office, v_area from offices order by number offset i - 1 limit 1;
    select id into v_company from companies order by nif offset ((i - 1) % 30) limit 1;
    v_off := case i when 1 then 22 when 2 then 38 when 3 then 52 when 4 then 92 when 5 then 92 when 6 then 151
             else 160 + ((i * 37) % 200) end;
    v_end := current_date + v_off;
    insert into contracts(office_id, company_id, start_date, end_date, total_value, installments_count, periodicity, due_day, status)
    values (v_office, v_company, (v_end - interval '12 months')::date, v_end, round(v_area * 12000 * 12), 12, 'mensal', 25, 'ativo');
  end loop;

  -- Pagamentos das parcelas já vencidas; os 8 últimos contratos ficam com as últimas prestações em atraso
  insert into payments(installment_id, amount, paid_at, method)
  select i.id, i.amount, greatest(i.due_date - floor(random() * 4)::int, c.start_date),
         (array['transferencia','multicaixa','numerario'])[1 + floor(random() * 3)::int]::payment_method
  from installments i join contracts c on c.id = i.contract_id
  where i.due_date < current_date
    and not (c.number in (select number from contracts order by number desc limit 8) and i.due_date >= current_date - 75);

  perform run_daily_jobs();   -- estados (em atraso / a terminar) e notificações

  update offices set status = 'manutencao' where number = '223';
  update offices set status = 'reservado' where number = '224';

  -- ── Eventos
  select id into v_venue from venues limit 1;
  if v_venue is null then
    insert into venues(name, kind, capacity, base_price) values ('Salão de Festas', 'salao', 500, 3500000) returning id into v_venue;
  end if;

  insert into venue_reservations(venue_id, title, client, starts_at, ends_at, guests, status, price)
  select v_venue, t.title, t.client,
         ((current_date + t.d)::timestamp + t.h * interval '1 hour') at time zone 'Africa/Luanda',
         ((current_date + t.d)::timestamp + (t.h + 8) * interval '1 hour') at time zone 'Africa/Luanda',
         t.guests, t.status::reservation_status, t.price
  from (values
    (2,  18, 'Casamento Costa',               'Família Costa',        280, 'confirmada', 3500000),
    (5,  19, 'Aniversário — Empresa XYZ',     'Empresa XYZ',          120, 'pendente',   1800000),
    (9,  18, 'Conferência Empresarial',       'Media Solutions',      200, 'confirmada', 2200000),
    (13, 19, 'Jantar Corporativo',            'Atlântico Seguros',    150, 'confirmada', 2600000),
    (20, 17, 'Batizado Mendes',               'Família Mendes',        90, 'pendente',   1500000),
    (27, 18, 'Workshop Planalto Digital',     'Planalto Digital',     100, 'confirmada', 1200000)
  ) as t(d, h, title, client, guests, status, price);

  insert into event_payments(reservation_id, amount, paid_at, method)
  select r.id, case when r.status = 'confirmada' then r.price else round(r.price * 0.3) end,
         current_date - 3, 'transferencia'
  from venue_reservations r where r.price > 0 and r.starts_at > now();

  -- ── RH
  insert into employees(full_name, position, department, hire_date, salary) values
    ('Beatriz Santos','Gestora de condomínio','Administração','2024-02-01',320000),
    ('Domingos Alves','Segurança','Operações','2023-06-12',150000),
    ('Helena Rocha','Contabilista','Financeiro','2022-09-05',280000),
    ('Isaías Pinto','Eletricista','Manutenção','2024-11-18',210000),
    ('Joana Teixeira','Coordenadora de eventos','Eventos','2023-03-20',260000),
    ('Kiala Mateus','Auxiliar de limpeza','Operações','2025-01-10',110000),
    ('Leonor Duarte','Rececionista','Administração','2025-05-02',170000),
    ('Mário Baptista','Motorista','Operações','2022-12-01',160000),
    ('Nádia Cardoso','Assistente comercial','Comercial','2024-08-26',200000),
    ('Osvaldo Gaspar','Canalizador','Manutenção','2023-10-09',190000);

  insert into attendance(employee_id, day, status)
  select e.id, d::date,
         case when random() < 0.04 then 'falta' when random() < 0.03 then 'justificada' else 'presente' end
  from employees e, generate_series(current_date - 13, current_date - 1, interval '1 day') d
  where extract(isodow from d) < 6
  on conflict do nothing;

  -- ── Logística, fornecedores e manutenção
  insert into suppliers(name, category, phone, email) values
    ('Namibe Frio Lda','Climatização','923555010','geral@namibefrio.ao'),
    ('Eletro Sul','Eletricidade','923555020','vendas@eletrosul.ao'),
    ('Limpeza Total','Limpeza','923555030','contacto@limpezatotal.ao'),
    ('Buffet Real','Catering','923555040','reservas@buffetreal.ao');

  insert into logistics_items(name, category, quantity, min_quantity, location, supplier_id)
  select t.name, t.cat, t.q, t.m, t.loc, (select id from suppliers where name = t.sup limit 1)
  from (values
    ('Toalhas de mesa','Têxtil',120,80,'Armazém','Buffet Real'),
    ('Pratos (conjunto)','Louça',300,250,'Armazém','Buffet Real'),
    ('Copos','Louça',520,400,'Armazém','Buffet Real'),
    ('Lâmpadas LED','Eletricidade',40,60,'Armazém','Eletro Sul'),
    ('Detergente (litros)','Limpeza',25,30,'Armazém','Limpeza Total'),
    ('Filtros de ar condicionado','Climatização',12,10,'Armazém','Namibe Frio Lda')
  ) as t(name, cat, q, m, loc, sup);

  insert into logistics_movements(item_id, kind, quantity, destination, note)
  select id, 'saida', 40, 'Casamento Costa', 'Preparação do salão' from logistics_items where name = 'Copos'
  union all select id, 'entrada', 30, 'Armazém', 'Reposição' from logistics_items where name = 'Detergente (litros)'
  union all select id, 'saida', 10, 'Escritório 203', 'Substituição' from logistics_items where name = 'Lâmpadas LED';

  insert into maintenance_tickets(title, area, priority, status, cost, supplier_id)
  select t.title, t.area, t.prio, t.st::ticket_status, t.cost, (select id from suppliers where name = t.sup limit 1)
  from (values
    ('Fuga de água na casa de banho do 2.º piso','Piso 2','urgente','em_curso',null::numeric,'Namibe Frio Lda'),
    ('Substituir lâmpadas do corredor','Piso 3','normal','aberto',null::numeric,'Eletro Sul'),
    ('Revisão do ar condicionado do Salão','Salão','alta','concluido',85000::numeric,'Namibe Frio Lda'),
    ('Pintura da fachada lateral','Exterior','baixa','aberto',null::numeric,'Eletro Sul'),
    ('Limpeza profunda pós-evento','Salão','normal','concluido',45000::numeric,'Limpeza Total')
  ) as t(title, area, prio, st, cost, sup);

  -- ── Alertas manuais (além dos criados pela rotina diária)
  insert into notifications(kind, title, body, link, dedupe_key, created_at) values
    ('fatura_a_vencer','Faturas a vencer','5 faturas vencem em 3 dias','/dividas','demo-1', now() - interval '2 hours'),
    ('pagamento_atrasado','Pagamentos em atraso','8 contratos com pagamentos em atraso','/dividas','demo-2', now() - interval '3 hours'),
    ('contrato_a_expirar','Contrato a expirar','Media Solutions — 22 dias','/contratos','demo-3', now() - interval '5 hours'),
    ('imposto','Imposto de selo mensal','Prazo de pagamento até dia 25','/impostos','demo-4', now() - interval '6 hours'),
    ('evento','Evento confirmado','Casamento Costa — em 2 dias','/agenda','demo-5', now() - interval '1 day');

  raise notice 'Dados de demonstração criados.';
end $$;
