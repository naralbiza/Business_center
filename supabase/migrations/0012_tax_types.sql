-- Impostos: novos tipos e campos de gestão (referência, período, em preparação). Só acrescenta; não altera dados.
alter type tax_kind add value if not exists 'iva';
alter type tax_kind add value if not exists 'iac';
alter type tax_kind add value if not exists 'irpc';
alter type tax_kind add value if not exists 'predial';
alter type tax_kind add value if not exists 'taxa';

alter table tax_obligations
  add column if not exists reference text,
  add column if not exists period_label text,
  add column if not exists in_preparation boolean not null default false;
