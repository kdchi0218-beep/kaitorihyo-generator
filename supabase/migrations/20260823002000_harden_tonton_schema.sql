-- 初期migration適用後の防御強化。
-- 適用済みmigrationは書き換えず、この追補をすべての環境へ適用する。

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_settings'::regclass
      and conname = 'store_settings_settings_check'
  ) then
    alter table public.store_settings
      add constraint store_settings_settings_check
      check (jsonb_typeof(settings) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.templates'::regclass
      and conname = 'templates_settings_check'
  ) then
    alter table public.templates
      add constraint templates_settings_check
      check (jsonb_typeof(settings) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.card_lists'::regclass
      and conname = 'card_lists_items_check'
  ) then
    alter table public.card_lists
      add constraint card_lists_items_check
      check (jsonb_typeof(items) = 'array');
  end if;
end;
$$;

create index if not exists templates_store_updated_idx
  on public.templates (store_id, updated_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at
before update on public.store_settings
for each row execute function private.set_updated_at();

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
before update on public.templates
for each row execute function private.set_updated_at();

drop trigger if exists card_lists_set_updated_at on public.card_lists;
create trigger card_lists_set_updated_at
before update on public.card_lists
for each row execute function private.set_updated_at();

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
  on public.stores for select to authenticated
  using ((select private.can_access_store(id)));

revoke all on public.app_admins, public.stores, public.store_members,
  public.store_settings, public.templates, public.card_lists from service_role;
grant select, insert, update, delete on public.app_admins, public.stores, public.store_members,
  public.store_settings, public.templates, public.card_lists to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets',
  'store-assets',
  true,
  10485760,
  array['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
