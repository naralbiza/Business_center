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
