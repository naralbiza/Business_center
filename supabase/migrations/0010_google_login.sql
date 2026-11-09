-- Login com Google: contas novas criadas por OAuth ficam INATIVAS até um administrador as ativar.
-- Utilizadores criados por email/palavra-passe (convite do administrador) continuam ativos.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_app_meta_data->>'provider', 'email') = 'email'
  );
  return new;
end $$;
