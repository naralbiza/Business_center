-- Novos cargos. Correr SOZINHO e ANTES de 0019_permissions.sql (um valor de enum só pode ser usado depois de confirmado).
alter type app_role add value if not exists 'administrador';
alter type app_role add value if not exists 'restaurante';
alter type app_role add value if not exists 'operacoes';
