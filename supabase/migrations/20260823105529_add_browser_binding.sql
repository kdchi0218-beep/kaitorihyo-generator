-- Browser-bound sessions.  Tokens and browser secrets are kept in HttpOnly
-- cookies by the Vercel BFF; the database stores only a SHA-256 digest.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.browser_bindings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text check (revocation_reason is null or char_length(revocation_reason) <= 240),
  check (revoked_at is null or revoked_at >= bound_at)
);

-- Exactly one active browser may be bound to an account.
create unique index if not exists browser_bindings_one_active_user_idx
  on public.browser_bindings (user_id)
  where revoked_at is null;
-- The full index is also required for the auth.users FK cascade after a
-- binding has been revoked (the partial unique index excludes those rows).
create index if not exists browser_bindings_user_id_idx
  on public.browser_bindings (user_id);
create index if not exists browser_bindings_revoked_by_idx
  on public.browser_bindings (revoked_by)
  where revoked_by is not null;

create table if not exists public.browser_binding_events (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid references public.browser_bindings(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('bound', 'revoked', 'reset', 'rejected')),
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists browser_binding_events_target_created_idx
  on public.browser_binding_events (target_user_id, created_at desc);
create index if not exists browser_binding_events_binding_id_idx
  on public.browser_binding_events (binding_id)
  where binding_id is not null;
create index if not exists browser_binding_events_actor_user_id_idx
  on public.browser_binding_events (actor_user_id)
  where actor_user_id is not null;

create or replace function private.record_browser_binding_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.browser_binding_events (binding_id, target_user_id, event_type)
  values (new.id, new.user_id, 'bound');
  return new;
end;
$$;

drop trigger if exists browser_binding_created_audit on public.browser_bindings;
create trigger browser_binding_created_audit
after insert on public.browser_bindings
for each row execute function private.record_browser_binding_created();

revoke all on function private.record_browser_binding_created() from public, anon, authenticated;

create or replace function private.record_browser_binding_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.revoked_at is null and new.revoked_at is not null then
    insert into public.browser_binding_events (
      binding_id, target_user_id, actor_user_id, event_type, reason
    ) values (
      new.id, new.user_id, new.revoked_by, 'reset', new.revocation_reason
    );
  end if;
  return new;
end;
$$;

drop trigger if exists browser_binding_revoked_audit on public.browser_bindings;
create trigger browser_binding_revoked_audit
after update of revoked_at on public.browser_bindings
for each row execute function private.record_browser_binding_revoked();

revoke all on function private.record_browser_binding_revoked() from public, anon, authenticated;

alter table public.browser_bindings enable row level security;
alter table public.browser_binding_events enable row level security;
revoke all on public.browser_bindings, public.browser_binding_events from anon, authenticated;
grant select, insert, update, delete on public.browser_bindings, public.browser_binding_events to service_role;

-- Store logos/backgrounds are business assets too. Keep the bucket private;
-- the browser reads them through the bound-session Vercel BFF.
update storage.buckets
set public = false
where id = 'store-assets';
drop policy if exists "store-assets public read" on storage.objects;

create or replace function private.has_bound_browser()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers jsonb := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  request_device_id text := headers->>'x-browser-device-id';
  request_secret text := headers->>'x-browser-device-secret';
begin
  -- Service role bypasses RLS in normal Supabase requests. Keep this explicit
  -- for callers that evaluate this helper under a service-role JWT.
  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;
  if auth.uid() is null
    or request_device_id is null
    or request_secret is null
    or request_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or request_secret !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  return exists (
    select 1
    from public.browser_bindings binding
    where binding.id = request_device_id::uuid
      and binding.user_id = (select auth.uid())
      and binding.revoked_at is null
      and binding.secret_hash = encode(extensions.digest(request_secret, 'sha256'), 'hex')
  );
end;
$$;

revoke all on function private.has_bound_browser() from public, anon;
grant execute on function private.has_bound_browser() to authenticated, service_role;

-- Replace all user-facing business policies so every direct Data/Storage API
-- request needs both a valid Supabase JWT and the per-browser secret headers.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('app_admins', 'stores', 'store_members', 'store_settings', 'templates', 'card_lists')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

create policy app_admins_select_bound_self
  on public.app_admins for select to authenticated
  using ((select private.has_bound_browser()) and user_id = (select auth.uid()));

create policy stores_select_bound_member
  on public.stores for select to authenticated
  using ((select private.has_bound_browser()) and (select private.can_access_store(id)));
create policy stores_insert_bound_admin
  on public.stores for insert to authenticated
  with check ((select private.has_bound_browser()) and (select private.is_admin()));
create policy stores_update_bound_admin
  on public.stores for update to authenticated
  using ((select private.has_bound_browser()) and (select private.is_admin()))
  with check ((select private.has_bound_browser()) and (select private.is_admin()));
create policy stores_delete_bound_admin
  on public.stores for delete to authenticated
  using ((select private.has_bound_browser()) and (select private.is_admin()));

create policy store_members_select_bound_self_or_admin
  on public.store_members for select to authenticated
  using ((select private.has_bound_browser()) and (user_id = (select auth.uid()) or (select private.is_admin())));
create policy store_members_insert_bound_admin
  on public.store_members for insert to authenticated
  with check ((select private.has_bound_browser()) and (select private.is_admin()));
create policy store_members_update_bound_admin
  on public.store_members for update to authenticated
  using ((select private.has_bound_browser()) and (select private.is_admin()))
  with check ((select private.has_bound_browser()) and (select private.is_admin()));
create policy store_members_delete_bound_admin
  on public.store_members for delete to authenticated
  using ((select private.has_bound_browser()) and (select private.is_admin()));

create policy store_settings_bound_access
  on public.store_settings for all to authenticated
  using ((select private.has_bound_browser()) and (select private.can_access_store(store_id)))
  with check ((select private.has_bound_browser()) and (select private.can_access_store(store_id)));
create policy templates_bound_access
  on public.templates for all to authenticated
  using ((select private.has_bound_browser()) and (select private.can_access_store(store_id)))
  with check ((select private.has_bound_browser()) and (select private.can_access_store(store_id)));
create policy card_lists_bound_access
  on public.card_lists for all to authenticated
  using ((select private.has_bound_browser()) and (select private.can_access_store(store_id)))
  with check ((select private.has_bound_browser()) and (select private.can_access_store(store_id)));

drop policy if exists "store-assets member insert" on storage.objects;
drop policy if exists "store-assets member update" on storage.objects;
drop policy if exists "store-assets member delete" on storage.objects;
create policy "store-assets bound member read"
  on storage.objects for select to authenticated
  using (bucket_id = 'store-assets'
    and (select private.has_bound_browser())
    and (select private.can_access_store_path((storage.foldername(name))[1])));
create policy "store-assets bound member insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets'
    and (select private.has_bound_browser())
    and (select private.can_access_store_path((storage.foldername(name))[1])));
create policy "store-assets bound member update"
  on storage.objects for update to authenticated
  using (bucket_id = 'store-assets'
    and (select private.has_bound_browser())
    and (select private.can_access_store_path((storage.foldername(name))[1])))
  with check (bucket_id = 'store-assets'
    and (select private.has_bound_browser())
    and (select private.can_access_store_path((storage.foldername(name))[1])));
create policy "store-assets bound member delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets'
    and (select private.has_bound_browser())
    and (select private.can_access_store_path((storage.foldername(name))[1])));
