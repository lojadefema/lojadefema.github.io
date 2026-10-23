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
