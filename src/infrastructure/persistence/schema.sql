-- Rodacenter AI — esquema preparado para PostgreSQL / MySQL (futuro)
-- No se ejecuta automáticamente en v1.0 (repositorios en memoria).

CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY,
  phone         VARCHAR(32) NOT NULL UNIQUE,
  name          VARCHAR(120),
  channel       VARCHAR(32) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY,
  customer_id   UUID NOT NULL REFERENCES customers(id),
  channel       VARCHAR(32) NOT NULL,
  external_id   VARCHAR(120) NOT NULL UNIQUE,
  context_json  JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY,
  conversation_id  UUID NOT NULL REFERENCES conversations(id),
  role             VARCHAR(32) NOT NULL,
  content          TEXT NOT NULL,
  metadata_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY,
  sku           VARCHAR(64) NOT NULL UNIQUE,
  name          VARCHAR(160) NOT NULL,
  category      VARCHAR(64) NOT NULL,
  brand         VARCHAR(80),
  description   TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  price         NUMERIC(12, 2),
  currency      VARCHAR(8),
  specs_json    JSONB,
  tags          TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id            UUID PRIMARY KEY,
  product_id    UUID NOT NULL REFERENCES products(id),
  sku           VARCHAR(64) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  location      VARCHAR(80),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  conversation_id  UUID NOT NULL REFERENCES conversations(id),
  status           VARCHAR(32) NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id            UUID PRIMARY KEY,
  sale_id       UUID NOT NULL REFERENCES sales(id),
  product_id    UUID NOT NULL REFERENCES products(id),
  sku           VARCHAR(64) NOT NULL,
  quantity      INTEGER NOT NULL,
  unit_price    NUMERIC(12, 2)
);

CREATE TABLE IF NOT EXISTS conversation_logs (
  id                 UUID PRIMARY KEY,
  logged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_id        UUID,
  customer_phone     VARCHAR(32) NOT NULL,
  conversation_id    UUID,
  inbound_message    TEXT NOT NULL,
  outbound_response  TEXT NOT NULL,
  duration_ms        INTEGER NOT NULL,
  error              TEXT,
  metadata_json      JSONB
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_logs_phone ON conversation_logs(customer_phone);
