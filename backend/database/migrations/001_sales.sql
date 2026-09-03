BEGIN;
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_label VARCHAR(180) NOT NULL,
  buyer_name VARCHAR(120) NOT NULL,
  buyer_phone VARCHAR(30),
  sale_date DATE NOT NULL,
  sale_price NUMERIC(14,2) NOT NULL CHECK (sale_price > 0 AND sale_price <= 100000000),
  purchase_price NUMERIC(14,2) NOT NULL CHECK (purchase_price >= 0),
  expenses_total NUMERIC(14,2) NOT NULL CHECK (expenses_total >= 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('pix','transfer','cash','financing','mixed')),
  notes VARCHAR(2000),
  previous_status VARCHAR(20) NOT NULL CHECK (previous_status IN ('available','reserved')),
  previous_sale_price NUMERIC(14,2),
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER,
  cancellation_reason VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_one_active_vehicle ON sales(vehicle_id) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(sale_date DESC, id DESC);
COMMIT;
