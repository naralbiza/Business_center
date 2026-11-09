-- Keep-alive: o plano gratuito do Supabase pausa o projeto após ~7 dias sem actividade.
-- Um agendador externo (GitHub Actions ou /api/keepalive) chama keepalive_ping() e isto regista uma linha.

create table if not exists keepalive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);
alter table keepalive enable row level security;  -- sem políticas: ninguém lê ou escreve directamente

create or replace function keepalive_ping() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz := now();
begin
  -- no máximo 1 inserção por hora (a função é pública: evita que alguém a use para encher a tabela)
  if not exists (select 1 from keepalive where pinged_at > now() - interval '1 hour') then
    insert into keepalive default values;
  end if;
  delete from keepalive where pinged_at < now() - interval '30 days';
  return t;
end $$;

revoke all on function keepalive_ping() from public;
grant execute on function keepalive_ping() to anon, authenticated;
