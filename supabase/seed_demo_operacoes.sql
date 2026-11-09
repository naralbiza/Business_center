-- Dados de demonstração das Operações. Correr DEPOIS de 0016_operations.sql, uma vez (ignora se já houver equipamentos).
do $$
declare
  sup uuid[];
  eq uuid[];
  i int; d int;
begin
  if exists (select 1 from equipment) then
    raise notice 'Já existem equipamentos: nada a fazer.';
    return;
  end if;

  insert into suppliers(name, category, phone, email, nif, rating, status) values
    ('Águas do Namibe', 'Água e Bebidas', '923600001', 'geral@aguasnamibe.ao', '5412567890', 5, 'ativo'),
    ('Sonangol Distribuição', 'Combustíveis', '923600002', 'comercial@sonangol.ao', '5409876543', 4, 'ativo'),
    ('AngoLimpeza', 'Produtos de Limpeza', '923600003', 'vendas@angolimpeza.ao', '5411122334', 4, 'ativo'),
    ('TecnoEventos Lda', 'Equip. Audiovisual', '923600004', 'info@tecnoeventos.ao', '5415566778', 3, 'avaliacao'),
    ('Mundo Mobiliário', 'Mobiliário e Decoração', '923600005', 'loja@mundomobiliario.ao', '5413344556', 4, 'ativo');
  select array_agg(id order by name) into sup from suppliers where nif in ('5412567890', '5409876543', '5411122334', '5415566778', '5413344556');

  insert into equipment(code, name, category, location, status, supplier_id, acquired_at, value)
  select t.code, t.name, t.cat, t.loc, t.st, sup[1 + (t.i % array_length(sup, 1))], current_date - t.age, t.v
  from (values
    (1, 'EQ-001', 'Ar Condicionado – Recepção', 'Climatização', 'Recepção', 'manutencao', 900, 1200000),
    (2, 'EQ-002', 'Elevador – Bloco A', 'Elevadores', 'Bloco A', 'manutencao', 1500, 9800000),
    (3, 'EQ-003', 'Gerador – Sala Técnica', 'Energia', 'Sala Técnica', 'operacional', 1100, 6400000),
    (4, 'EQ-004', 'Sistema de Bombagem', 'Hidráulica', 'Casa das Máquinas', 'manutencao', 800, 2100000),
    (5, 'EQ-005', 'Iluminação – Estacionamento', 'Iluminação', 'Estacionamento', 'operacional', 500, 750000),
    (6, 'EQ-006', 'Sistema de Som – Salão', 'Audiovisual', 'Salão de Festas', 'operacional', 400, 3200000),
    (7, 'EQ-007', 'Projetor – Sala de Reuniões', 'Audiovisual', 'Sala de Reuniões', 'operacional', 300, 480000),
    (8, 'EQ-008', 'Câmara Frigorífica', 'Cozinha', 'Restaurante', 'operacional', 700, 1900000),
    (9, 'EQ-009', 'Ar Condicionado – Salão', 'Climatização', 'Salão de Festas', 'operacional', 600, 2400000),
    (10, 'EQ-010', 'Portão Automático', 'Segurança', 'Entrada', 'inativo', 1300, 650000),
    (11, 'EQ-011', 'Central de Alarme', 'Segurança', 'Receção', 'fora_servico', 1700, 430000),
    (12, 'EQ-012', 'Máquina de Lavar Loiça', 'Cozinha', 'Restaurante', 'operacional', 350, 520000)
  ) as t(i, code, name, cat, loc, st, age, v);
  select array_agg(id order by code) into eq from equipment;

  -- Custos dos últimos ~45 dias, distribuídos pelas categorias
  for d in 0..44 loop
    if d % 2 = 0 then
      insert into operational_costs(spent_on, category, description, amount, supplier_id) values
        (current_date - d, (array['manutencao', 'compras', 'servicos', 'energia', 'outros'])[1 + (d / 2) % 5],
         (array['Reparação e peças', 'Compra de consumíveis', 'Serviço contratado', 'Eletricidade e água', 'Despesas diversas'])[1 + (d / 2) % 5],
         (60000 + ((d * 7919) % 340000)), sup[1 + (d % 5)]);
    end if;
  end loop;

  -- Plano preventivo
  insert into maintenance_plans(equipment_id, title, every_days, next_due) values
    (eq[3], 'Revisão do gerador', 90, current_date + 12),
    (eq[2], 'Inspeção do elevador', 60, current_date + 5),
    (eq[9], 'Limpeza de filtros do ar condicionado', 30, current_date + 2),
    (eq[8], 'Verificação da câmara frigorífica', 45, current_date + 20);

  -- Ordens de manutenção ligadas a equipamentos (as existentes mantêm-se)
  insert into maintenance_tickets(title, area, priority, status, cost, supplier_id, equipment_id) values
    ('Ar Condicionado – Recepção', 'Recepção', 'alta', 'aberto', null, sup[1], eq[1]),
    ('Elevador – Bloco A', 'Bloco A', 'normal', 'em_curso', null, sup[2], eq[2]),
    ('Gerador – Sala Técnica', 'Sala Técnica', 'normal', 'concluido', 185000, sup[3], eq[3]),
    ('Sistema de Bombagem', 'Casa das Máquinas', 'urgente', 'aberto', null, sup[4], eq[4]),
    ('Iluminação – Estacionamento', 'Estacionamento', 'baixa', 'em_curso', null, sup[5], eq[5]);

  raise notice 'Operações de demonstração criadas.';
end $$;
