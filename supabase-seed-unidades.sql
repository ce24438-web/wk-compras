-- Seed data for the units used by WK Compras
-- Run this after supabase-schema.sql so the unidades table already exists.

insert into public.unidades (nome_padrao, cnpj, aliases)
values
  ('BM PLANALTINA', '37.489.383/0003-85', array['BM PLANALTINA', 'PLANALTINA']),
  ('BM RIO VERDE - GO', '37.489.383/0001-13', array['BM RIO VERDE - GO', 'BM RIO VERDE', 'RIO VERDE']),
  ('BM ANÁPOLIS - GO', '37.489.383/0010-04', array['BM ANÁPOLIS - GO', 'BM ANAPOLIS - GO', 'BM ANAPOLIS', 'ANÁPOLIS', 'ANAPOLIS']),
  ('BM CAMPINORTE - GO', '37.489.383/0006-28', array['BM CAMPINORTE - GO', 'BM CAMPINORTE', 'CAMPINORTE']),
  ('BM NIQUELÂNDIA - GO', '37.489.383/0007-09', array['BM NIQUELÂNDIA - GO', 'BM NIQUELANDIA - GO', 'BM NIQUELANDIA', 'NIQUELÂNDIA', 'NIQUELANDIA']),
  ('REGIONAL DERIVADOS', '05.405.388/0001-24', array['REGIONAL DERIVADOS']),
  ('JARAGUÁ - GO', '27.370.739/0001-41', array['JARAGUÁ - GO', 'JARAGUA - GO', 'JARAGUÁ', 'JARAGUA']),
  ('BM CATALÃO - GO', '37.489.383/0002-02', array['BM CATALÃO - GO', 'BM CATALAO - GO', 'BM CATALAO', 'CATALÃO', 'CATALAO']),
  ('BM GOIANÉSIA - GO', '37.489.383/0009-70', array['BM GOIANÉSIA - GO', 'BM GOIANESIA - GO', 'BM GOIANESIA', 'GOIANÉSIA', 'GOIANESIA']),
  ('KBW', '07.557.958/0001-27', array['KBW']),
  ('WK 14', '58.889.718/0002-02', array['WK 14']),
  ('REDE DE POSTOS QUERÊNCIA MT', '58.889.718/0003-85', array['REDE DE POSTOS QUERÊNCIA MT', 'REDE DE POSTOS QUERENCIA MT', 'QUERÊNCIA MT', 'QUERENCIA MT'])
on conflict (cnpj) do update
set
  nome_padrao = excluded.nome_padrao,
  aliases = excluded.aliases,
  ativo = true,
  updated_at = now();
