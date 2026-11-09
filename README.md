# Business Center Esperança

Sistema de gestão integrada do centro empresarial: escritórios, contratos, pagamentos, dívidas, impostos, eventos (CRM e agenda do salão), RH, logística e relatórios.

Stack: Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage, RLS, pg_cron).

## Arranque

1. `npm install`
2. Criar `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Correr no SQL Editor do Supabase, por ordem, os ficheiros de `supabase/migrations/` (0001 a 0008). `supabase/seed.sql` é opcional (dados de exemplo).
4. Criar um utilizador em Authentication → Users e dar-lhe o papel: `update profiles set role = 'super_admin' where id = (select id from auth.users where email = '...');`
5. `npm run dev` → http://localhost:3000

Sem `.env.local` as páginas principais mostram dados de demonstração.

## Papéis
`super_admin` (tudo), `financeiro`, `eventos`, `rh`, `operador` (só leitura). Gerem-se em /utilizadores.
