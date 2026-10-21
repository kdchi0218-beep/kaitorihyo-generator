-- dot → 本人LINE通知の保存と送信記録、ChatGPTコネクタ用OAuthの状態。
-- 時刻はすべてUTCのISO 8601文字列。トークン・認可コードは平文を保存せずSHA-256だけを持つ。

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,               -- dotが決める通知ID（重複防止のキー）
  content_hash TEXT NOT NULL,        -- 同じIDで内容が違う呼び出しを弾くため
  source TEXT NOT NULL,              -- 'dot'（OAuth経由）/ 'direct'（固定トークン経由）
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deliver_line INTEGER NOT NULL,     -- 1: LINEへ送る / 0: 保存のみ
  status TEXT NOT NULL,              -- saved_only / stored / sending / sent / uncertain / failed
  status_detail TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX idx_notifications_created ON notifications (created_at);
CREATE INDEX idx_notifications_updated ON notifications (updated_at);

CREATE TABLE delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT NOT NULL REFERENCES notifications (id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT NOT NULL,             -- sending / sent / already_sent / uncertain / failed
  detail TEXT,
  gas_status TEXT,
  gas_result TEXT,
  gas_code TEXT,
  http_status INTEGER
);
CREATE INDEX idx_attempts_notification ON delivery_attempts (notification_id);
CREATE INDEX idx_attempts_started ON delivery_attempts (started_at);

CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,           -- token_endpoint_auth_method が none のときは NULL
  client_name TEXT,
  redirect_uris TEXT NOT NULL,       -- JSON配列
  token_endpoint_auth_method TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_oauth_clients_created ON oauth_clients (created_at);

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT,
  grant_fingerprint TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                -- access / refresh
  client_id TEXT NOT NULL,
  family_id TEXT NOT NULL,           -- 同じ認可から続くトークンのまとまり（refreshの使い回し検知で一括失効）
  scope TEXT NOT NULL,
  grant_fingerprint TEXT NOT NULL,   -- 発行時の接続コードの指紋。接続コードを変えると全トークンが無効になる
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_oauth_tokens_family ON oauth_tokens (family_id);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens (expires_at);

CREATE TABLE auth_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                -- connect_code / registration
  at TEXT NOT NULL
);
CREATE INDEX idx_auth_failures_at ON auth_failures (kind, at);
