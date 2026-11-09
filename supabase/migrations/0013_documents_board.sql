-- Documentos: categorias, referência, estado e tags; permite documentos gerais (sem empresa/contrato associado).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'documents'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%entity%'
  loop
    execute format('alter table documents drop constraint %I', c.conname);
  end loop;
end $$;

alter table documents
  add constraint documents_entity_check
  check (entity in ('company', 'contract', 'employee', 'event', 'financeiro', 'fiscal', 'operacional', 'geral'));

alter table documents alter column entity_id drop not null;

alter table documents
  add column if not exists category text,
  add column if not exists reference text,
  add column if not exists status text not null default 'ativo',
  add column if not exists tags text,
  add column if not exists mime text;
