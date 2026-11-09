  -- Confirmação de email automática. A barreira de acesso é o campo profiles.active (contas novas nascem
  -- inativas, migração 0021), por isso confirmar o email à nascença não dá acesso a ninguém sozinho.

  create or replace function auto_confirm_email() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if new.email_confirmed_at is null then
      new.email_confirmed_at := now();
    end if;
    return new;
  end $$;

  drop trigger if exists auto_confirm_email_trg on auth.users;
  create trigger auto_confirm_email_trg before insert on auth.users
    for each row execute function auto_confirm_email();

  -- Contas já existentes e por confirmar (criadas pelo sistema ou pelo painel)
  update auth.users u set email_confirmed_at = now()
  where u.email_confirmed_at is null and exists (select 1 from public.profiles p where p.id = u.id);
