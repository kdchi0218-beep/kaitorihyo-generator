-- CardRushスクレイピング結果のサーバー専用キャッシュ。
-- ブラウザのpublishable keyからはアクセスさせず、Vercel Functionsのservice roleだけが利用する。

create table if not exists public.scrape_cache (
  source text not null,
  cache_key text not null,
  payload jsonb not null,
  scraped_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (source, cache_key),
  constraint scrape_cache_source_length check (char_length(source) between 1 and 80),
  constraint scrape_cache_key_length check (char_length(cache_key) between 1 and 128)
);

create index if not exists scrape_cache_expires_at_idx
  on public.scrape_cache (expires_at);

alter table public.scrape_cache enable row level security;

revoke all on table public.scrape_cache from anon, authenticated;
grant select, insert, update, delete on table public.scrape_cache to service_role;

comment on table public.scrape_cache is
  'Server-only cache for authenticated scraping functions; no browser access.';
