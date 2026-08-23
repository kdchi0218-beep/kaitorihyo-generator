-- scrape_cache はVercel Functionsのservice_role専用。
-- 権限剥奪に加え、ブラウザ向けroleをRLSでも明示的に拒否する。

create policy scrape_cache_deny_browser_access
  on public.scrape_cache
  for all
  to anon, authenticated
  using (false)
  with check (false);
