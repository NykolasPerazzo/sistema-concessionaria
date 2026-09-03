BEGIN;
CREATE TABLE IF NOT EXISTS proposals (
 id SERIAL PRIMARY KEY,
 vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 vehicle_label VARCHAR(180) NOT NULL,
 buyer_name VARCHAR(120) NOT NULL,
 buyer_phone VARCHAR(30),
 proposed_price NUMERIC(14,2) NOT NULL CHECK(proposed_price > 0 AND proposed_price <= 100000000),
 payment_method VARCHAR(20) NOT NULL CHECK(payment_method IN ('pix','transfer','cash','financing','mixed')),
 valid_until DATE NOT NULL,
 notes VARCHAR(2000),
 status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','cancelled','converted')),
 sale_id INTEGER UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK ((status='converted') = (sale_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS proposals_created_idx ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_vehicle_idx ON proposals(vehicle_id);
COMMIT;
