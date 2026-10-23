-- =====================================================================
-- DEFEMA · Catálogo — 13_estoque.sql
-- Controle de estoque do painel: quantidade de cada produto e o ponto
-- de reposição ("avisar quando chegar em X").
--
-- Fica numa tabela separada de produtos de propósito: o site (anon) lê
-- produtos, mas NÃO enxerga o estoque. Só administradores leem e gravam.
-- quantidade nula = produto sem controle de estoque.
-- Só cria coisas novas; pode rodar de novo sem problema.
-- =====================================================================
create table if not exists public.estoque (
  produto_id     uuid primary key references public.produtos(id) on delete cascade,
  quantidade     numeric(12,3) null,
  minimo         numeric(12,3) null check (minimo is null or minimo >= 0),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid null default auth.uid()
);
comment on table public.estoque is
  'Estoque por produto (só painel). minimo = avisar para repor quando a quantidade chegar nele.';

grant select, insert, update, delete on public.estoque to authenticated;
revoke all on public.estoque from anon;

alter table public.estoque enable row level security;

drop policy if exists "estoque: admin lê" on public.estoque;
create policy "estoque: admin lê" on public.estoque
  for select to authenticated using (public.eh_admin());
drop policy if exists "estoque: admin grava" on public.estoque;
create policy "estoque: admin grava" on public.estoque
  for insert to authenticated with check (public.eh_admin());
drop policy if exists "estoque: admin altera" on public.estoque;
create policy "estoque: admin altera" on public.estoque
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "estoque: admin apaga" on public.estoque;
create policy "estoque: admin apaga" on public.estoque
  for delete to authenticated using (public.eh_admin());

-- ---------------------------------------------------------------------
-- Pedidos de compra ao fornecedor (só painel)
-- itens = [{produto_id, nome, marca, emb, qtd, custo, recebido, fator}]
-- status: aguardando → parcial (chegou parte) → recebido | cancelado
-- ---------------------------------------------------------------------
create table if not exists public.pedidos_compra (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null,
  fornecedor   text null,
  obs          text null,
  itens        jsonb not null default '[]'::jsonb,
  total        numeric(12,2) null,
  status       text not null default 'aguardando' check (status in ('aguardando','parcial','recebido','cancelado')),
  criado_em    timestamptz not null default now(),
  criado_por   uuid null default auth.uid(),
  recebido_em  timestamptz null
);
create index if not exists pedidos_compra_status_idx on public.pedidos_compra (status, criado_em desc);
grant select, insert, update, delete on public.pedidos_compra to authenticated;
revoke all on public.pedidos_compra from anon;
alter table public.pedidos_compra enable row level security;
drop policy if exists "pedidos: admin lê" on public.pedidos_compra;
create policy "pedidos: admin lê" on public.pedidos_compra for select to authenticated using (public.eh_admin());
drop policy if exists "pedidos: admin grava" on public.pedidos_compra;
create policy "pedidos: admin grava" on public.pedidos_compra for insert to authenticated with check (public.eh_admin());
drop policy if exists "pedidos: admin altera" on public.pedidos_compra;
create policy "pedidos: admin altera" on public.pedidos_compra for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "pedidos: admin apaga" on public.pedidos_compra;
create policy "pedidos: admin apaga" on public.pedidos_compra for delete to authenticated using (public.eh_admin());
