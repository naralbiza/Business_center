-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPAR TODOS OS DADOS DE PRODUÇÃO — INÍCIO DO ZERO
-- Executar no SQL Editor do Supabase (com service role / postgres).
-- Preserva o esquema, as migrações, as funções, as views e os utilizadores
-- da tabela auth.users. Apenas apaga dados das tabelas de negócio.
-- ═══════════════════════════════════════════════════════════════════════════

-- Desativar temporariamente os triggers para evitar erros de ordem
SET session_replication_role = replica;

-- ── Operações / Manutenção / Logística
DELETE FROM maintenance_plans;
DELETE FROM maintenance_tickets;
DELETE FROM operational_costs;
DELETE FROM logistics_movements;
DELETE FROM logistics_items;
DELETE FROM equipment;
DELETE FROM suppliers;

-- ── Restaurante
DELETE FROM restaurant_reservations;
DELETE FROM restaurant_tables;

-- ── RH / Presenças
DELETE FROM attendance;
DELETE FROM employees;

-- ── Eventos / CRM
DELETE FROM event_payments;
DELETE FROM venue_reservations;
DELETE FROM event_leads;
DELETE FROM venues;

-- ── Impostos
DELETE FROM tax_obligations;

-- ── Documentos
DELETE FROM documents;

-- ── Financeiro / Contratos
DELETE FROM payments;
DELETE FROM installments;
DELETE FROM contracts;
DELETE FROM debts;  -- vista materializada ou tabela auxiliar (ignora se não existir)

-- ── Escritórios e Empresas
DELETE FROM offices;
DELETE FROM companies;
DELETE FROM buildings;

-- ── Notificações
DELETE FROM notifications;

-- Reativar triggers
SET session_replication_role = DEFAULT;

-- Confirmar
SELECT
  (SELECT count(*) FROM companies)       AS empresas,
  (SELECT count(*) FROM offices)         AS escritorios,
  (SELECT count(*) FROM contracts)       AS contratos,
  (SELECT count(*) FROM installments)    AS parcelas,
  (SELECT count(*) FROM payments)        AS pagamentos,
  (SELECT count(*) FROM employees)       AS funcionarios,
  (SELECT count(*) FROM event_leads)     AS leads,
  (SELECT count(*) FROM venue_reservations) AS reservas,
  (SELECT count(*) FROM notifications)   AS notificacoes,
  (SELECT count(*) FROM tax_obligations) AS impostos,
  (SELECT count(*) FROM suppliers)       AS fornecedores,
  (SELECT count(*) FROM equipment)       AS equipamentos,
  (SELECT count(*) FROM restaurant_tables) AS mesas;
