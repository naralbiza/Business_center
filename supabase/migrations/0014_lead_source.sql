-- CRM de Eventos: origem do lead (Website, Instagram, Indicação, Google, Outros). Só acrescenta.
alter table event_leads add column if not exists source text;
