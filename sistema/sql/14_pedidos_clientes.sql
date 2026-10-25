-- =====================================================================
-- DEFEMA · 14_pedidos_clientes.sql  (já aplicado no banco em 25/10/2026)
-- Pedidos feitos pelos clientes (site; no futuro, bot do WhatsApp).
-- novo → separando → pronto → retirado | cancelado
-- O site (sem login) só cria pedido pela função criar_pedido_cliente,
-- que confere os produtos e recalcula o total com os preços do banco.
-- =====================================================================
create table if not exists public.pedidos_clientes (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity (start with 101),
  cliente_nome  text null,
  cliente_tel   text null,
  itens         jsonb not null default '[]'::jsonb,   -- [{produto_id,nome,marca,op,qtd,preco,separado}]
  total_pix     numeric(12,2) null,
  total_cartao  numeric(12,2) null,
  consultar     boolean not null default false,
  obs           text null,
  origem        text not null default 'site' check (origem in ('site','whatsapp','balcao','simulado')),
  status        text not null default 'novo' check (status in ('novo','separando','pronto','retirado','cancelado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  pronto_em     timestamptz null,
  retirado_em   timestamptz null
);
-- (políticas: só administradores leem/alteram; anon sem acesso direto)
-- função: public.criar_pedido_cliente(p_nome text, p_tel text, p_itens jsonb, p_obs text) returns bigint (security definer)
