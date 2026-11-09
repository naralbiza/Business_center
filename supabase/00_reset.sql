-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1 — LIMPEZA SEGURA de restos de instalações parciais deste sistema.
-- Recusa-se a correr se já existirem dados reais (empresas, escritórios, contratos, pagamentos).
-- Correr no SQL Editor do Supabase ANTES de setup_all.sql.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text; n bigint;
begin
  foreach t in array array['companies','offices','contracts','installments','payments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'A tabela % já tem % linhas. Limpeza cancelada para não perder dados.', t, n;
      end if;
    end if;
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists documents_read on storage.objects;
drop policy if exists documents_insert on storage.objects;
drop policy if exists documents_delete on storage.objects;

drop view if exists reservation_summary, contract_summary, debts cascade;
drop table if exists
  documents, event_payments, venue_reservations, event_leads, venues,
  attendance, employees, logistics_movements, logistics_items, maintenance_tickets, suppliers,
  tax_obligations, activity_logs, notifications, office_custom_fields,
  payments, installments, contracts, offices, companies, profiles cascade;
drop sequence if exists contract_seq cascade;
drop type if exists
  app_role, office_status, contract_status, periodicity, installment_status, payment_method,
  notification_kind, tax_kind, lead_stage, reservation_status, employee_status, ticket_status cascade;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'current_role_name','has_role','handle_new_user','generate_installments','trg_contract_generate',
      'trg_payment_apply','run_daily_jobs','log_change','run_tax_jobs','run_daily_jobs_all',
      'trg_event_payment_apply','trg_reservation_lead','trg_movement_apply','trg_ticket_office')
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;
