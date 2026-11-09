-- Configurações do sistema (uma linha por secção, valores em JSON). Requer 0019_permissions.sql.
create table if not exists app_settings (
  section text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
alter table app_settings enable row level security;

drop policy if exists settings_read on app_settings;
drop policy if exists settings_write on app_settings;
create policy settings_read on app_settings for select to authenticated using (true);
create policy settings_write on app_settings for all to authenticated
  using (has_perm('administracao', 2)) with check (has_perm('administracao', 2));

-- Regista a secção alterada no registo de actividade
create or replace function log_change_key() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(user_id, action, entity, detail)
  values (auth.uid(), tg_op, tg_table_name, jsonb_build_object('name', coalesce(new.section, old.section)));
  return coalesce(new, old);
end $$;

drop trigger if exists audit_app_settings on app_settings;
create trigger audit_app_settings after insert or update or delete on app_settings
  for each row execute function log_change_key();
