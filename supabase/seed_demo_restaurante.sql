-- Dados de demonstração do Restaurante (12 mesas e reservas à volta de hoje). Correr DEPOIS de 0015_restaurant.sql, uma vez.
do $$
declare
  xs numeric[] := array[21, 39.5, 57, 74.7];
  ys numeric[] := array[19, 51, 84];
  i int; r int; c int;
  tid uuid[];
  names text[] := array['Carlos Mendes','Ana Silva','Grupo Sonangol','Família Costa','João Pereira','Empresa Total','Maria Eduardo','Grupo Empresarial','Rui Fernandes','Helena Marques','Sofia Almeida','Luís Manuel','Banco BAI','Endiama','Mariana Costa','Tiago Santos'];
  sts text[] := array['confirmada','a_chegar','em_curso','confirmada','confirmada','confirmada','confirmada','a_chegar','aguardar','concluida'];
  tstat text[] := array['livre','ocupada','reservada','livre','preparar','ocupada','livre','reservada','livre','livre','ocupada','reservada'];
  d int; k int; hh int;
begin
  if exists (select 1 from restaurant_tables) then
    raise notice 'Já existem mesas: nada a fazer.';
    return;
  end if;

  for r in 0..2 loop
    for c in 0..3 loop
      i := r * 4 + c + 1;
      insert into restaurant_tables(code, capacity, pos_x, pos_y, status)
      values ('Mesa ' || lpad(i::text, 2, '0'), case when i % 4 = 0 then 6 when i % 3 = 0 then 2 else 4 end, xs[c + 1], ys[r + 1], tstat[i]);
    end loop;
  end loop;
  select array_agg(id order by code) into tid from restaurant_tables;

  -- reservas: hoje (8), e uma dúzia por dia nos dias à volta
  for d in -6..6 loop
    for k in 1..(case when d = 0 then 8 else 4 + (abs(d) % 4) end) loop
      hh := 9 + ((k * 2 + abs(d)) % 12);
      insert into restaurant_reservations(table_id, client, phone, party_size, starts_at, status)
      values (
        tid[1 + ((k + abs(d)) % 12)], names[1 + ((k * 3 + abs(d)) % 16)], '92' || lpad((3000000 + k * 1117 + abs(d) * 313)::text, 7, '0'),
        2 + ((k + abs(d)) % 7),
        ((current_date + d)::timestamp + (hh || ' hours')::interval + case when k % 2 = 0 then interval '30 minutes' else interval '0' end) at time zone 'Africa/Luanda',
        case when d < 0 then (case when k % 5 = 0 then 'cancelada' else 'concluida' end)
             when d = 0 then sts[1 + (k % 10)]
             else (case when k % 4 = 0 then 'aguardar' else 'confirmada' end) end
      );
    end loop;
  end loop;
  raise notice 'Restaurante de demonstração criado.';
end $$;
