-- Dados de demonstração de Recursos Humanos. Correr DEPOIS de 0017_hr.sql. Atualiza funcionários existentes e cria presenças.
-- Se não houver funcionários, cria alguns. Ignora se já houver presenças com horas de entrada.
do $$
declare
  deps text[] := array['Administração', 'Marketing', 'Operações', 'Restaurante', 'Eventos', 'Manutenção'];
  ctypes text[] := array['Efetivo', 'Termo certo', 'Prestação de serviços', 'Estágio', 'Efetivo', 'Efetivo'];
  cends int[] := array[null, 5, 10, 21, null, 26];
  e record; k int := 0; d int; st text; cin time;
begin
  if exists (select 1 from attendance where check_in is not null) then
    raise notice 'Já existem presenças com horas: nada a fazer.';
    return;
  end if;

  if (select count(*) from employees) < 6 then
    insert into employees(full_name, position, department, hire_date, salary) values
      ('Ana Silva', 'Recepcionista', 'Administração', current_date - 700, 180000),
      ('Carlos Mendes', 'Chefe de Cozinha', 'Restaurante', current_date - 950, 320000),
      ('Maria Eduardo', 'Coordenadora', 'Eventos', current_date - 400, 260000),
      ('João Pereira', 'Técnico', 'Manutenção', current_date - 1200, 210000),
      ('Luísa Manuel', 'Assistente', 'Marketing', current_date - 150, 170000),
      ('Daniel Costa', 'Supervisor', 'Operações', current_date - 900, 240000);
  end if;

  for e in select id from employees where status <> 'desligado' order by full_name loop
    k := k + 1;
    update employees set
      department = deps[1 + (k % 6)],
      contract_type = ctypes[1 + (k % 6)],
      contract_end = case when cends[1 + (k % 6)] is null then null else current_date + cends[1 + (k % 6)] end,
      birth_date = make_date(1985 + (k % 12), 1 + ((extract(month from current_date)::int - 1 + (k % 3)) % 12), 1 + ((k * 5) % 27))
    where id = e.id;

    -- presenças dos últimos 10 dias úteis (hoje incluído)
    for d in 0..13 loop
      if extract(isodow from current_date - d) < 6 then
        st := case when (k + d) % 17 = 0 then 'falta' when (k + d) % 9 = 0 then 'atraso' when (k + d) % 23 = 0 then 'ferias' else 'presente' end;
        cin := case when st = 'atraso' then time '08:12' + ((k % 4) * interval '5 minutes') when st in ('falta', 'ferias') then null else time '07:55' + ((k % 6) * interval '2 minutes') end;
        insert into attendance(employee_id, day, status, check_in, check_out)
        values (e.id, current_date - d, st, cin, case when cin is null or d = 0 then null else time '17:00' + ((k % 5) * interval '3 minutes') end)
        on conflict (employee_id, day) do update set status = excluded.status, check_in = excluded.check_in, check_out = excluded.check_out;
      end if;
    end loop;
  end loop;
  raise notice 'Recursos Humanos de demonstração criados.';
end $$;
