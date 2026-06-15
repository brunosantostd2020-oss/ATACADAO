-- =====================================================================
-- Atacadao Cervejaria — Schema PostgreSQL
-- Sistema de comandas com autenticacao por papeis
-- =====================================================================

-- Extensao para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- USUARIOS  (dono/admin, caixa, garcom)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'garcom'
                CHECK (role IN ('admin', 'caixa', 'garcom')),
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- PRODUTOS (cardapio)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT          NOT NULL,
  price_cents     INTEGER       NOT NULL CHECK (price_cents >= 0),
  category        TEXT          NOT NULL DEFAULT 'geral',
  active          BOOLEAN       NOT NULL DEFAULT TRUE,
  -- Controle de estoque
  stock_qty       INTEGER       NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  stock_min       INTEGER       NOT NULL DEFAULT 5,  -- alerta abaixo desse valor
  track_stock     BOOLEAN       NOT NULL DEFAULT FALSE, -- se FALSE ignora estoque
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Historico de movimentacoes de estoque (entradas e saidas)
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
  qty         INTEGER     NOT NULL,  -- positivo = entrada, negativo = saida
  reason      TEXT,                  -- ex: "Compra", "Comanda #123", "Ajuste manual"
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_created ON stock_movements(created_at);

-- ---------------------------------------------------------------------
-- COMANDAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comandas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer     TEXT          NOT NULL,
  status       TEXT          NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'partial', 'paid', 'canceled')),
  opened_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  paid_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  payment_method TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  paid_at      TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comandas_status  ON comandas(status);
CREATE INDEX IF NOT EXISTS idx_comandas_paid_at ON comandas(paid_at);

-- ---------------------------------------------------------------------
-- ITENS DA COMANDA  (snapshot de nome/preco no momento do lancamento)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comanda_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id  UUID          NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  product_id  UUID          REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT          NOT NULL,
  price_cents INTEGER       NOT NULL CHECK (price_cents >= 0),
  qty         INTEGER       NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_comanda ON comanda_items(comanda_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_comanda_product
  ON comanda_items(comanda_id, product_id);

-- ---------------------------------------------------------------------
-- PAGAMENTOS (suporta pagamento parcial: varios pagamentos por comanda)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id     UUID        NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  amount_cents   INTEGER     NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT        NOT NULL DEFAULT 'dinheiro',
  paid_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_comanda ON payments(comanda_id);

-- ---------------------------------------------------------------------
-- MIGRACAO SEGURA: se o banco ja existia da versao antiga (com coluna
-- "email"), adiciona "username" sem perder dados. Roda sempre, idempotente.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- adiciona a coluna username se ainda nao existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username TEXT;
    -- preenche username a partir do email antigo (parte antes do @),
    -- ou de um valor unico, para nao quebrar a constraint
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
      UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;
    END IF;
    UPDATE users SET username = 'user_' || left(id::text, 8) WHERE username IS NULL OR username = '';
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
    -- cria indice unico se ainda nao houver
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_username_key'
    ) THEN
      ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
    END IF;
  END IF;

  -- Se ainda existe a coluna antiga "email" como NOT NULL, torna opcional
  -- para nao bloquear a criacao de novos usuarios (que usam so username).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

-- Migracao: adiciona colunas de estoque na tabela products se nao existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock_qty') THEN
    ALTER TABLE products ADD COLUMN stock_qty   INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN stock_min   INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE products ADD COLUMN track_stock BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Trigger para manter updated_at sempre atualizado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated    ON users;
DROP TRIGGER IF EXISTS trg_products_updated ON products;
DROP TRIGGER IF EXISTS trg_comandas_updated ON comandas;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_comandas_updated BEFORE UPDATE ON comandas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
