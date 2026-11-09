-- As vistas passam a respeitar o RLS do utilizador que consulta (por omissão correm como dono e ignoram o RLS).
alter view contract_summary set (security_invoker = true);
alter view debts set (security_invoker = true);

-- Perfis para utilizadores criados antes do gatilho handle_new_user
insert into profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email) from auth.users u
on conflict (id) do nothing;

update profiles set role = 'super_admin'
where id = (select id from auth.users where email = 'businesscenteresperanca@gmail.com');
