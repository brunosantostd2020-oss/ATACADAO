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
  email         TEXT        NOT NULL UNIQUE,
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
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT          NOT NULL,
  price_cents INTEGER       NOT NULL CHECK (price_cents >= 0),
  category    TEXT          NOT NULL DEFAULT 'geral',
  active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

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
