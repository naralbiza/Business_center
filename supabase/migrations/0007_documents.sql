insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and current_role_name() is not null);
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and has_role('financeiro','eventos','rh'));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and has_role('financeiro','eventos','rh'));

create table documents (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('company','contract','employee','event')),
  entity_id uuid not null,
  name text not null,
  path text not null unique,
  size bigint,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on documents(entity, entity_id);
alter table documents enable row level security;
create policy docs_read on documents for select to authenticated using (current_role_name() is not null and (entity <> 'employee' or has_role('rh')));
create policy docs_write on documents for all to authenticated using (has_role('financeiro','eventos','rh')) with check (has_role('financeiro','eventos','rh'));
create trigger audit_documents after insert or update or delete on documents for each row execute function log_change();
