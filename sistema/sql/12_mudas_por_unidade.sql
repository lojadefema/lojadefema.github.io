-- =====================================================================
-- DEFEMA · Catálogo — 12_mudas_por_unidade.sql
-- Mudas de bandeja passam a ser vendidas POR UNIDADE no balcão.
--
--  * produtos.preco          = preço de UMA muda (antes: preço do lote)
--  * produtos.preco_bandeja  = preço da bandeja fechada (encomenda) — igual
--  * mudas_movimentos        = sem mudança (já conta em mudas)
--
-- Preços passados pela loja em 23/10/2026. Pode rodar de novo sem problema.
-- =====================================================================

comment on column public.produtos.preco_bandeja is
  'Mudas de bandeja: preço da bandeja fechada (encomenda). Em produtos.preco fica o preço de UMA muda (venda por unidade no balcão).';

-- 1) Preço por muda ------------------------------------------------------
update public.produtos set preco = 0.20, preco_antigo = null
 where nome in ('Muda de alface crespa Vanda', 'Muda de alface americana',
                'Muda de almeirão Pão de Açúcar', 'Muda de salsa',
                'Muda de rúcula', 'Muda de coentro');   -- rúcula e coentro: mesmo preço das folhosas (confirmar)
update public.produtos set preco = 0.30, preco_antigo = null where nome = 'Muda de cebolinha';
update public.produtos set preco = 0.50, preco_antigo = null where nome = 'Muda de couve manteiga';
update public.produtos set preco = 1.00, preco_antigo = null
 where nome in ('Muda de pimentão híbrido Magali', 'Muda de berinjela Napoli',
                'Muda de berinjela japonesa', 'Muda de jiló');

-- 2) Pimentas vêm de bandeja (128) e custam R$ 1,00 a muda --------------
update public.produtos p
   set subcategoria_id = s.id, preco = 1.00, preco_antigo = null,
       unidade = 'Bandeja com 128 mudas',
       descricao = 'Bandeja com 128 mudas prontas para transplante para o canteiro ou para o vaso. Retire na loja.'
  from public.subcategorias s
 where s.nome = 'Bandeja 128 mudas'
   and p.nome in ('Muda de pimenta malagueta', 'Muda de pimenta dedo-de-moça');

-- 3) Repolho: bandeja do tamanho da couve (128), R$ 0,50 a muda ----------
insert into public.produtos (nome, subcategoria_id, unidade, preco, preco_bandeja, descricao, ativo, ordem)
select 'Muda de repolho', s.id, 'Bandeja com 128 mudas', 0.50, 62.90,
       'Bandeja com 128 mudas prontas para transplante para o canteiro ou para o vaso. Retire na loja.', true, 755
  from public.subcategorias s
 where s.nome = 'Bandeja 128 mudas'
   and not exists (select 1 from public.produtos where nome = 'Muda de repolho');
