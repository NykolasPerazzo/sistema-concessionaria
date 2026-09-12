BEGIN;

-- Vendedor responsável pela venda. Nullable para preservar vendas antigas
-- (registradas antes deste recurso), que continuam válidas com seller_id NULL.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id INTEGER;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_seller_id_fkey;
ALTER TABLE sales ADD CONSTRAINT sales_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_seller_idx ON sales(seller_id);

COMMIT;
