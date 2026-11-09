-- Permissões reais por módulo, aplicadas no backend (RLS). Requer 0018_roles_enum.sql já aplicada.
-- Níveis: 0 = sem acesso · 1 = ver · 2 = editar · 3 = total.   Super admin passa sempre.

alter table profiles
  add column if not exists department text,
  add column if not exists phone text,
  add column if not exists group_id uuid;

create table if not exists permission_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles drop constraint if exists profiles_group_fk;
alter table profiles add constraint profiles_group_fk foreign key (group_id) references permission_groups(id) on delete set null;

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  module text not null,
  level int not null default 0 check (level between 0 and 3),
  unique (role, module)
);
create table if not exists group_permissions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references permission_groups(id) on delete cascade,
  module text not null,
  level int not null default 0 check (level between 0 and 3),
  unique (group_id, module)
);
create table if not exists access_log (
  id bigint generated always as identity primary key,
  email text,
  ok boolean not null,
  created_at timestamptz not null default now()
);

-- ───────── Funções ─────────
create or replace function perm_level(m text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not p.active then 0
    when p.role = 'super_admin' then 3
    else greatest(
      coalesce((select rp.level from role_permissions rp where rp.role = p.role and rp.module = m), 0),
      coalesce((select max(gp.level) from group_permissions gp join permission_groups g on g.id = gp.group_id
                 where gp.group_id = p.group_id and g.active and gp.module = m), 0))
  end
  from (select 1) x left join profiles p on p.id = auth.uid()
$$;

create or replace function has_perm(m text, need int) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(perm_level(m) >= need, false) $$;

-- "administrador" passa nas verificações antigas por papel (documentos, notificações…)
create or replace function has_role(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(current_role_name() in ('super_admin', 'administrador') or current_role_name() = any(roles), false) $$;

-- Registo de tentativas de acesso (chamável antes do login)
create or replace function log_access(p_email text, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  insert into access_log(email, ok) values (left(lower(coalesce(p_email, '')), 200), p_ok)
$$;
grant execute on function log_access(text, boolean) to anon, authenticated;

-- Informação de contas e sessões (lê o esquema auth; só para quem administra)
create or replace function admin_users() returns table (id uuid, email text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not has_perm('administracao', 1) then raise exception 'Sem permissão.'; end if;
  return query select u.id, u.email::text, u.last_sign_in_at from auth.users u;
end $$;

create or replace function admin_sessions() returns table (id uuid, user_id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not has_perm('administracao', 2) then raise exception 'Sem permissão.'; end if;
  return query select s.id, s.user_id, s.created_at, s.updated_at, s.user_agent, host(s.ip)::text
               from auth.sessions s where s.not_after is null or s.not_after > now();
end $$;

create or replace function admin_revoke_sessions(target uuid) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not has_perm('administracao', 2) then raise exception 'Sem permissão.'; end if;
  if exists (select 1 from profiles where id = target and role = 'super_admin') and current_role_name() <> 'super_admin' then
    raise exception 'Apenas o super admin pode revogar sessões de um super admin.';
  end if;
  delete from auth.sessions where user_id = target;
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────── Permissões por omissão (equivalentes ao comportamento anterior) ─────────
insert into role_permissions(role, module, level)
select r.role::app_role, m.module, r.level
from (values
  ('administrador','dashboard',3),('administrador','escritorios',2),('administrador','empresas',2),('administrador','contratos',2),('administrador','financeiro',2),
  ('administrador','eventos',2),('administrador','restaurante',2),('administrador','operacoes',2),('administrador','rh',2),('administrador','relatorios',2),('administrador','administracao',2),
  ('financeiro','dashboard',1),('financeiro','escritorios',2),('financeiro','empresas',2),('financeiro','contratos',2),('financeiro','financeiro',2),
  ('financeiro','eventos',1),('financeiro','restaurante',1),('financeiro','operacoes',2),('financeiro','relatorios',1),
  ('eventos','dashboard',1),('eventos','escritorios',1),('eventos','empresas',1),('eventos','contratos',1),('eventos','financeiro',1),
  ('eventos','eventos',2),('eventos','restaurante',2),('eventos','operacoes',2),('eventos','relatorios',1),
  ('rh','dashboard',1),('rh','escritorios',1),('rh','empresas',1),('rh','contratos',1),('rh','eventos',1),('rh','restaurante',1),('rh','operacoes',1),('rh','rh',2),('rh','relatorios',1),
  ('restaurante','dashboard',1),('restaurante','eventos',1),('restaurante','restaurante',2),('restaurante','operacoes',1),('restaurante','relatorios',1),
  ('operacoes','dashboard',1),('operacoes','escritorios',1),('operacoes','operacoes',2),('operacoes','relatorios',1),
  ('operador','dashboard',1),('operador','escritorios',1),('operador','empresas',1),('operador','contratos',1),('operador','financeiro',1),
  ('operador','eventos',1),('operador','restaurante',1),('operador','operacoes',1),('operador','relatorios',1)
) as r(role, module, level)
join (values ('dashboard'),('escritorios'),('empresas'),('contratos'),('financeiro'),('eventos'),('restaurante'),('operacoes'),('rh'),('relatorios'),('administracao')) as m(module) on m.module = r.module
on conflict (role, module) do nothing;

insert into permission_groups(name, description) values
  ('Administrativo', 'Acesso administrativo'), ('Operacional', 'Operações e manutenção'), ('Comercial', 'Vendas e marketing'),
  ('Financeiro', 'Financeiro e impostos'), ('Recursos Humanos', 'Gestão de pessoas'), ('Visualização', 'Apenas leitura')
on conflict (name) do nothing;

-- ───────── RLS: políticas por módulo ─────────
alter table role_permissions enable row level security;
alter table group_permissions enable row level security;
alter table permission_groups enable row level security;
alter table access_log enable row level security;

do $$
declare
  t record;
  old text;
begin
  -- políticas antigas por papel (se existirem)
  for t in select * from (values
    ('companies','empresas'), ('offices','escritorios'), ('office_custom_fields','escritorios'), ('buildings','escritorios'),
    ('contracts','contratos'), ('installments','financeiro'), ('payments','financeiro'), ('tax_obligations','financeiro'), ('operational_costs','financeiro'),
    ('venues','eventos'), ('event_leads','eventos'), ('venue_reservations','eventos'), ('event_payments','eventos'),
    ('restaurant_tables','restaurante'), ('restaurant_reservations','restaurante'),
    ('suppliers','operacoes'), ('logistics_items','operacoes'), ('logistics_movements','operacoes'), ('maintenance_tickets','operacoes'),
    ('equipment','operacoes'), ('maintenance_plans','operacoes'),
    ('employees','rh'), ('attendance','rh')
  ) as v(tbl, module)
  loop
    continue when to_regclass('public.' || t.tbl) is null;
    foreach old in array array[t.tbl || '_read', t.tbl || '_write', 'tax_read', 'tax_write', 'emp_rh', 'att_rh', 'evpay_read', 'evpay_write',
                               'rest_tables_read', 'rest_tables_write', 'rest_res_read', 'rest_res_write']
    loop
      execute format('drop policy if exists %I on %I', old, t.tbl);
    end loop;
    execute format('drop policy if exists %I on %I', 'perm_' || t.tbl || '_read', t.tbl);
    execute format('drop policy if exists %I on %I', 'perm_' || t.tbl || '_write', t.tbl);
    execute format('create policy %I on %I for select to authenticated using (has_perm(%L, 1))', 'perm_' || t.tbl || '_read', t.tbl, t.module);
    execute format('create policy %I on %I for all to authenticated using (has_perm(%L, 2)) with check (has_perm(%L, 2))', 'perm_' || t.tbl || '_write', t.tbl, t.module, t.module);
  end loop;
end $$;

-- Contas e permissões: ver contas (qualquer utilizador ativo), editar só com "administração" ≥ editar; permissões só com nível total
drop policy if exists profiles_admin on profiles;
drop policy if exists perm_profiles_write on profiles;
create policy perm_profiles_write on profiles for all to authenticated using (has_perm('administracao', 2)) with check (has_perm('administracao', 2));

drop policy if exists perm_role_permissions_read on role_permissions;
drop policy if exists perm_role_permissions_write on role_permissions;
create policy perm_role_permissions_read on role_permissions for select to authenticated using (current_role_name() is not null);
create policy perm_role_permissions_write on role_permissions for all to authenticated using (has_perm('administracao', 3)) with check (has_perm('administracao', 3));

drop policy if exists perm_group_permissions_read on group_permissions;
drop policy if exists perm_group_permissions_write on group_permissions;
create policy perm_group_permissions_read on group_permissions for select to authenticated using (current_role_name() is not null);
create policy perm_group_permissions_write on group_permissions for all to authenticated using (has_perm('administracao', 3)) with check (has_perm('administracao', 3));

drop policy if exists perm_groups_read on permission_groups;
drop policy if exists perm_groups_write on permission_groups;
create policy perm_groups_read on permission_groups for select to authenticated using (current_role_name() is not null);
create policy perm_groups_write on permission_groups for all to authenticated using (has_perm('administracao', 3)) with check (has_perm('administracao', 3));

drop policy if exists access_log_read on access_log;
create policy access_log_read on access_log for select to authenticated using (has_perm('administracao', 1));
drop policy if exists logs_read on activity_logs;
create policy logs_read on activity_logs for select to authenticated using (has_perm('administracao', 1));

-- ───────── Proteção contra escalada de privilégios ─────────
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if auth.uid() is not null and current_role_name() is distinct from 'super_admin' then
      if new.role in ('super_admin', 'administrador') or old.role in ('super_admin', 'administrador') then
        raise exception 'Apenas o super admin pode alterar contas administrativas.';
      end if;
    end if;
    if auth.uid() is not null and old.id = auth.uid() and new.role is distinct from old.role then
      raise exception 'Não pode alterar o seu próprio cargo.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on profiles;
create trigger profiles_guard_trg before update on profiles for each row execute function profiles_guard();

-- ───────── Auditoria das alterações críticas ─────────
drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles after update on profiles for each row execute function log_change();
drop trigger if exists audit_role_permissions on role_permissions;
create trigger audit_role_permissions after insert or update or delete on role_permissions for each row execute function log_change();
drop trigger if exists audit_group_permissions on group_permissions;
create trigger audit_group_permissions after insert or update or delete on group_permissions for each row execute function log_change();
drop trigger if exists audit_permission_groups on permission_groups;
create trigger audit_permission_groups after insert or update or delete on permission_groups for each row execute function log_change();
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
-- Endurecimento de segurança. Requer 0019_permissions.sql.

-- 1) Contas novas nascem SEMPRE inativas: um registo público (signUp com a chave anon) não dá acesso.
--    O administrador ativa a conta (a ação "Novo utilizador" já faz active = true depois de criar).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), false);
  return new;
end $$;

-- 2) Perfis: cada pessoa vê o seu; a lista completa só para quem administra utilizadores.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or has_perm('administracao', 1));

-- 3) Registo de acessos com limite de volume e bloqueio temporário após falhas repetidas.
create index if not exists access_log_email_time on access_log (email, created_at desc);

create or replace function log_access(p_email text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e text := left(lower(coalesce(p_email, '')), 200);
begin
  -- limites anti-inundação: por email e global (por minuto)
  if (select count(*) from access_log where email = e and created_at > now() - interval '1 minute') >= 20 then return; end if;
  if (select count(*) from access_log where created_at > now() - interval '1 minute') >= 300 then return; end if;
  insert into access_log(email, ok) values (e, p_ok);
end $$;

create or replace function login_blocked(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 5
  from access_log a
  where a.email = left(lower(coalesce(p_email, '')), 200)
    and not a.ok
    and a.created_at > now() - interval '15 minutes'
    and a.created_at > coalesce((select max(b.created_at) from access_log b where b.email = a.email and b.ok), '-infinity');
$$;

revoke all on function log_access(text, boolean) from public;
revoke all on function login_blocked(text) from public;
grant execute on function log_access(text, boolean) to anon, authenticated;
grant execute on function login_blocked(text) to anon, authenticated;

-- 4) Documentos: tipos permitidos, limite de 10 MB e acesso segundo a matriz de permissões.
update storage.buckets set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf','image/png','image/jpeg','image/webp','text/csv','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']
where id = 'documents';

drop policy if exists documents_insert on storage.objects;
drop policy if exists documents_delete on storage.objects;
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (has_perm('financeiro', 2) or has_perm('eventos', 2) or has_perm('rh', 2) or has_perm('contratos', 2) or has_perm('empresas', 2)));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (has_perm('financeiro', 2) or has_perm('eventos', 2) or has_perm('rh', 2) or has_perm('contratos', 2) or has_perm('empresas', 2)));

-- 5) Notificações: quem as marca como lidas só pode alterar o estado "lida", nunca o conteúdo.
create or replace function notifications_only_read() returns trigger
language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body or new.link is distinct from old.link
     or new.kind is distinct from old.kind or new.dedupe_key is distinct from old.dedupe_key then
    raise exception 'Só é possível alterar o estado de leitura.';
  end if;
  return new;
end $$;
drop trigger if exists notifications_only_read on notifications;
create trigger notifications_only_read before update on notifications for each row execute function notifications_only_read();
