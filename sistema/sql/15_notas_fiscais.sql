-- =====================================================================
-- DEFEMA · 15_notas_fiscais.sql  (já aplicado no banco em 25/10/2026)
-- Controle de notas fiscais (o painel NÃO transmite para a Sefaz).
--  vendas_nf     = cada venda que precisa de nota (pedido retirado,
--                  baixa no estoque, venda lançada no balcão)
--  notas_fiscais = notas marcadas como emitidas, com os itens e as
--                  quantidades de cada (pode ser só parte do vendido).
--  Falta emitir = soma das vendas − soma dos itens das notas "emitida".
--  Reverter = status 'revertida' (os itens voltam para "a emitir").
-- Tabelas só para administradores (RLS com public.eh_admin()).
-- =====================================================================
create table if not exists public.vendas_nf (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid null references public.produtos(id) on delete set null,
  nome text not null, qtd numeric(12,3) not null check (qtd > 0), valor_unit numeric(12,2) null,
  origem text not null default 'manual' check (origem in ('pedido','estoque','manual')),
  ref text null, criado_em timestamptz not null default now(), criado_por uuid null default auth.uid()
);
create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(), numero text null, itens jsonb not null default '[]'::jsonb,
  total numeric(12,2) null, obs text null,
  status text not null default 'emitida' check (status in ('emitida','revertida')),
  emitida_em timestamptz not null default now(), revertida_em timestamptz null, criado_por uuid null default auth.uid()
);
