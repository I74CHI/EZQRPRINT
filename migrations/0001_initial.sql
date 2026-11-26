PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_owner_id ON sessions(owner_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES owners(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  upi_id TEXT,
  upi_payee_name TEXT,
  bw_per_page REAL NOT NULL DEFAULT 2,
  color_per_page REAL NOT NULL DEFAULT 10,
  daily_counter INTEGER NOT NULL DEFAULT 100,
  last_order_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  token_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'printing', 'awaiting_payment', 'completed')),
  payment_claimed INTEGER NOT NULL DEFAULT 0,
  files_purged INTEGER NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL,
  final_amount REAL NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  files_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_shop_status_created
  ON orders(shop_id, status, created_at);
