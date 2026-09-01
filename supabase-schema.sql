-- Supabase schema for WK Compras
-- Creates the tables, relationships, audit fields and history-preserving columns.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_user_role as enum ('ADMIN', 'USUARIO');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_audit_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, now());
    new.updated_at = coalesce(new.updated_at, now());
    new.created_by = coalesce(auth.uid(), new.created_by);
    new.updated_by = coalesce(auth.uid(), new.updated_by);
  elsif tg_op = 'UPDATE' then
    new.updated_at = now();
    new.updated_by = coalesce(auth.uid(), old.updated_by);
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, active, created_at, updated_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), new.email, split_part(new.email, '@', 1)),
    'USUARIO',
    true,
    now(),
    now()
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_user_role not null default 'USUARIO',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  nome_padrao text not null unique,
  cnpj text not null unique,
  aliases text[] not null default '{}'::text[],
  ativo boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cargas_principais (
  id uuid primary key default gen_random_uuid(),
  legacy_local_id text unique,
  unidade_id uuid references public.unidades (id) on delete set null,
  unidade_nome_snapshot text not null,
  cnpj_snapshot text,
  data date not null,
  etiqueta text not null default '',
  distribuidora text not null,
  motorista text not null default '',
  produto text not null,
  volume_m3 numeric(18,3) not null default 0,
  litros numeric(18,3) not null default 0,
  valor_litro numeric(18,6) not null default 0,
  total numeric(18,6) not null default 0,
  removed boolean not null default false,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cargas_boleto (
  id uuid primary key default gen_random_uuid(),
  legacy_local_id text unique,
  source_carga_id uuid references public.cargas_principais (id) on delete set null,
  unidade_id uuid references public.unidades (id) on delete set null,
  unidade_nome_snapshot text not null,
  cnpj_snapshot text,
  data date,
  etiqueta text not null default '',
  distribuidora text not null,
  motorista text not null default '',
  produto text not null,
  volume_m3 numeric(18,3) not null default 0,
  litros numeric(18,3) not null default 0,
  valor_litro numeric(18,6) not null default 0,
  total numeric(18,6) not null default 0,
  selected boolean not null default false,
  removed boolean not null default false,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creditos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  legacy_local_id text unique,
  source_carga_id uuid references public.cargas_principais (id) on delete set null,
  unidade_id uuid references public.unidades (id) on delete set null,
  unidade_nome_snapshot text not null,
  cnpj_snapshot text,
  data date,
  etiqueta text not null default '',
  distribuidora text not null,
  motorista text not null default '',
  produto_original text not null,
  novo_produto text not null,
  volume_original numeric(18,3) not null default 0,
  volume_ajustado numeric(18,3) not null default 0,
  litros_originais numeric(18,3) not null default 0,
  litros_ajustados numeric(18,3) not null default 0,
  valor_original numeric(18,6) not null default 0,
  valor_pago numeric(18,6) not null default 0,
  valor_ajustado numeric(18,6) not null default 0,
  total_original numeric(18,6) not null default 0,
  total_ajustado numeric(18,6) not null default 0,
  saldo numeric(18,6) not null default 0,
  selected boolean not null default false,
  removed boolean not null default false,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumo_volume_imports (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null unique,
  file_name text,
  imported_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumo_volume_itens (
  id uuid primary key default gen_random_uuid(),
  legacy_local_id text unique,
  import_id uuid not null references public.resumo_volume_imports (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  unidade_nome_snapshot text not null,
  cnpj_snapshot text,
  produto text not null,
  total numeric(18,3) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_hash text not null unique,
  records_count integer not null default 0,
  status text not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  imported_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_touch_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_unidades_audit
before insert or update on public.unidades
for each row execute function public.set_audit_columns();

create trigger trg_cargas_principais_audit
before insert or update on public.cargas_principais
for each row execute function public.set_audit_columns();

create trigger trg_cargas_boleto_audit
before insert or update on public.cargas_boleto
for each row execute function public.set_audit_columns();

create trigger trg_creditos_fornecedor_audit
before insert or update on public.creditos_fornecedor
for each row execute function public.set_audit_columns();

create trigger trg_resumo_volume_imports_audit
before insert or update on public.resumo_volume_imports
for each row execute function public.set_audit_columns();

create trigger trg_resumo_volume_itens_audit
before insert or update on public.resumo_volume_itens
for each row execute function public.set_audit_columns();

create trigger trg_migration_runs_audit
before insert or update on public.migration_runs
for each row execute function public.set_audit_columns();

create trigger trg_auth_user_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create index if not exists idx_cargas_principais_unidade_id on public.cargas_principais (unidade_id);
create index if not exists idx_cargas_principais_created_by on public.cargas_principais (created_by);
create index if not exists idx_cargas_principais_data on public.cargas_principais (data);
create index if not exists idx_cargas_boleto_source_carga_id on public.cargas_boleto (source_carga_id);
create index if not exists idx_cargas_boleto_created_by on public.cargas_boleto (created_by);
create index if not exists idx_creditos_fornecedor_source_carga_id on public.creditos_fornecedor (source_carga_id);
create index if not exists idx_creditos_fornecedor_created_by on public.creditos_fornecedor (created_by);
create index if not exists idx_resumo_volume_imports_imported_by on public.resumo_volume_imports (imported_by);
create index if not exists idx_resumo_volume_itens_import_id on public.resumo_volume_itens (import_id);
create index if not exists idx_resumo_volume_itens_created_by on public.resumo_volume_itens (created_by);
create index if not exists idx_migration_runs_imported_by on public.migration_runs (imported_by);
