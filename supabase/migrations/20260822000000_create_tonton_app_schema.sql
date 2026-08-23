-- とんとん買取表ジェネレーター用のマルチテナント基本スキーマ。
-- Vault用DBとは分離し、すべての店舗データをRLSで所属店舗に限定する。

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (store_id, user_id)
);

create index if not exists store_members_user_id_idx
  on public.store_members (user_id, store_id);

create table if not exists public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  genre text not null check (char_length(genre) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists templates_store_genre_updated_idx
  on public.templates (store_id, genre, updated_at desc);

create table if not exists public.card_lists (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  genre text not null check (char_length(genre) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists card_lists_store_genre_name_idx
  on public.card_lists (store_id, genre, name);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.app_admins
      where user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.store_members
      where store_id = target_store
        and user_id = (select auth.uid())
    );
$$;

create or replace function private.can_access_store_path(target_store text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_store is not null
    and (
      exists (
        select 1
        from public.app_admins
        where user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.store_members
        where store_id::text = target_store
          and user_id = (select auth.uid())
      )
    );
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_access_store(uuid) from public, anon;
revoke all on function private.can_access_store_path(text) from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.can_access_store(uuid) to authenticated, service_role;
grant execute on function private.can_access_store_path(text) to authenticated, service_role;

alter table public.app_admins enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.store_settings enable row level security;
alter table public.templates enable row level security;
alter table public.card_lists enable row level security;

create policy app_admins_select_self
  on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy stores_select_authenticated
  on public.stores for select to authenticated
  using (true);

create policy stores_insert_admin
  on public.stores for insert to authenticated
  with check ((select private.is_admin()));

create policy stores_update_admin
  on public.stores for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy stores_delete_admin
  on public.stores for delete to authenticated
  using ((select private.is_admin()));

create policy store_members_select_self_or_admin
  on public.store_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy store_members_insert_admin
  on public.store_members for insert to authenticated
  with check ((select private.is_admin()));

create policy store_members_update_admin
  on public.store_members for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy store_members_delete_admin
  on public.store_members for delete to authenticated
  using ((select private.is_admin()));

create policy store_settings_access
  on public.store_settings for all to authenticated
  using ((select private.can_access_store(store_id)))
  with check ((select private.can_access_store(store_id)));

create policy templates_access
  on public.templates for all to authenticated
  using ((select private.can_access_store(store_id)))
  with check ((select private.can_access_store(store_id)));

create policy card_lists_access
  on public.card_lists for all to authenticated
  using ((select private.can_access_store(store_id)))
  with check ((select private.can_access_store(store_id)));

revoke all on public.app_admins, public.stores, public.store_members,
  public.store_settings, public.templates, public.card_lists from anon;
grant select on public.app_admins to authenticated;
grant select, insert, update, delete on public.stores, public.store_members,
  public.store_settings, public.templates, public.card_lists to authenticated;
grant all on public.app_admins, public.stores, public.store_members,
  public.store_settings, public.templates, public.card_lists to service_role;

insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "store-assets public read"
  on storage.objects for select
  using (bucket_id = 'store-assets');

create policy "store-assets member insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'store-assets'
    and (select private.can_access_store_path((storage.foldername(name))[1]))
  );

create policy "store-assets member update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'store-assets'
    and (select private.can_access_store_path((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'store-assets'
    and (select private.can_access_store_path((storage.foldername(name))[1]))
  );

create policy "store-assets member delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'store-assets'
    and (select private.can_access_store_path((storage.foldername(name))[1]))
  );

comment on schema private is
  'Non-exposed RLS helper functions for the Tonton buy-list generator.';
comment on table public.app_admins is
  'Application administrators. Bootstrap users by resolved auth.users UUID, never by hardcoded generated IDs.';
