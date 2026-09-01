-- Supabase RLS policies for WK Compras
-- Keeps all protected data behind authenticated access and role-based permissions.

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'ADMIN'
  );
$$;

create or replace function public.is_row_owner(row_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_owner is not null and row_owner = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.unidades enable row level security;
alter table public.cargas_principais enable row level security;
alter table public.cargas_boleto enable row level security;
alter table public.creditos_fornecedor enable row level security;
alter table public.resumo_volume_imports enable row level security;
alter table public.resumo_volume_itens enable row level security;
alter table public.migration_runs enable row level security;

-- PROFILES
 drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
using (auth.uid() = id or public.is_admin_user());

 drop policy if exists profiles_update_admin_only on public.profiles;
create policy profiles_update_admin_only
on public.profiles
for update
using (public.is_admin_user())
with check (public.is_admin_user());

-- UNIDADES
 drop policy if exists unidades_select_active_members on public.unidades;
create policy unidades_select_active_members
on public.unidades
for select
using (public.is_active_member());

 drop policy if exists unidades_insert_admin_only on public.unidades;
create policy unidades_insert_admin_only
on public.unidades
for insert
with check (public.is_admin_user());

 drop policy if exists unidades_update_admin_only on public.unidades;
create policy unidades_update_admin_only
on public.unidades
for update
using (public.is_admin_user())
with check (public.is_admin_user());

 drop policy if exists unidades_delete_admin_only on public.unidades;
create policy unidades_delete_admin_only
on public.unidades
for delete
using (public.is_admin_user());

-- CARGAS PRINCIPAIS
 drop policy if exists cargas_principais_select_members on public.cargas_principais;
create policy cargas_principais_select_members
on public.cargas_principais
for select
using (public.is_active_member());

 drop policy if exists cargas_principais_insert_members on public.cargas_principais;
create policy cargas_principais_insert_members
on public.cargas_principais
for insert
with check (public.is_active_member());

 drop policy if exists cargas_principais_update_owner_or_admin on public.cargas_principais;
create policy cargas_principais_update_owner_or_admin
on public.cargas_principais
for update
using (public.is_admin_user() or public.is_row_owner(created_by))
with check (public.is_admin_user() or public.is_row_owner(created_by));

 drop policy if exists cargas_principais_delete_admin_only on public.cargas_principais;
create policy cargas_principais_delete_admin_only
on public.cargas_principais
for delete
using (public.is_admin_user());

-- CARGAS BOLETO
 drop policy if exists cargas_boleto_select_members on public.cargas_boleto;
create policy cargas_boleto_select_members
on public.cargas_boleto
for select
using (public.is_active_member());

 drop policy if exists cargas_boleto_insert_members on public.cargas_boleto;
create policy cargas_boleto_insert_members
on public.cargas_boleto
for insert
with check (public.is_active_member());

 drop policy if exists cargas_boleto_update_owner_or_admin on public.cargas_boleto;
create policy cargas_boleto_update_owner_or_admin
on public.cargas_boleto
for update
using (public.is_admin_user() or public.is_row_owner(created_by))
with check (public.is_admin_user() or public.is_row_owner(created_by));

 drop policy if exists cargas_boleto_delete_admin_only on public.cargas_boleto;
create policy cargas_boleto_delete_admin_only
on public.cargas_boleto
for delete
using (public.is_admin_user());

-- CREDITOS FORNECEDOR
 drop policy if exists creditos_fornecedor_select_members on public.creditos_fornecedor;
create policy creditos_fornecedor_select_members
on public.creditos_fornecedor
for select
using (public.is_active_member());

 drop policy if exists creditos_fornecedor_insert_members on public.creditos_fornecedor;
create policy creditos_fornecedor_insert_members
on public.creditos_fornecedor
for insert
with check (public.is_active_member());

 drop policy if exists creditos_fornecedor_update_owner_or_admin on public.creditos_fornecedor;
create policy creditos_fornecedor_update_owner_or_admin
on public.creditos_fornecedor
for update
using (public.is_admin_user() or public.is_row_owner(created_by))
with check (public.is_admin_user() or public.is_row_owner(created_by));

 drop policy if exists creditos_fornecedor_delete_admin_only on public.creditos_fornecedor;
create policy creditos_fornecedor_delete_admin_only
on public.creditos_fornecedor
for delete
using (public.is_admin_user());

-- RESUMO VOLUME IMPORTS
 drop policy if exists resumo_volume_imports_select_members on public.resumo_volume_imports;
create policy resumo_volume_imports_select_members
on public.resumo_volume_imports
for select
using (public.is_active_member());

 drop policy if exists resumo_volume_imports_insert_members on public.resumo_volume_imports;
create policy resumo_volume_imports_insert_members
on public.resumo_volume_imports
for insert
with check (public.is_active_member());

 drop policy if exists resumo_volume_imports_update_owner_or_admin on public.resumo_volume_imports;
create policy resumo_volume_imports_update_owner_or_admin
on public.resumo_volume_imports
for update
using (public.is_admin_user() or public.is_row_owner(created_by))
with check (public.is_admin_user() or public.is_row_owner(created_by));

 drop policy if exists resumo_volume_imports_delete_admin_only on public.resumo_volume_imports;
create policy resumo_volume_imports_delete_admin_only
on public.resumo_volume_imports
for delete
using (public.is_admin_user());

-- RESUMO VOLUME ITENS
 drop policy if exists resumo_volume_itens_select_members on public.resumo_volume_itens;
create policy resumo_volume_itens_select_members
on public.resumo_volume_itens
for select
using (public.is_active_member());

 drop policy if exists resumo_volume_itens_insert_members on public.resumo_volume_itens;
create policy resumo_volume_itens_insert_members
on public.resumo_volume_itens
for insert
with check (public.is_active_member());

 drop policy if exists resumo_volume_itens_update_owner_or_admin on public.resumo_volume_itens;
create policy resumo_volume_itens_update_owner_or_admin
on public.resumo_volume_itens
for update
using (public.is_admin_user() or public.is_row_owner(created_by))
with check (public.is_admin_user() or public.is_row_owner(created_by));

 drop policy if exists resumo_volume_itens_delete_admin_only on public.resumo_volume_itens;
create policy resumo_volume_itens_delete_admin_only
on public.resumo_volume_itens
for delete
using (public.is_admin_user());

-- MIGRATION RUNS
 drop policy if exists migration_runs_select_admin_only on public.migration_runs;
create policy migration_runs_select_admin_only
on public.migration_runs
for select
using (public.is_admin_user());

 drop policy if exists migration_runs_insert_admin_only on public.migration_runs;
create policy migration_runs_insert_admin_only
on public.migration_runs
for insert
with check (public.is_admin_user());

 drop policy if exists migration_runs_update_admin_only on public.migration_runs;
create policy migration_runs_update_admin_only
on public.migration_runs
for update
using (public.is_admin_user())
with check (public.is_admin_user());

 drop policy if exists migration_runs_delete_admin_only on public.migration_runs;
create policy migration_runs_delete_admin_only
on public.migration_runs
for delete
using (public.is_admin_user());
