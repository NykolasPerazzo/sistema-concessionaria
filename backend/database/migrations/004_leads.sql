BEGIN;
CREATE TABLE IF NOT EXISTS leads (
 id SERIAL PRIMARY KEY,
 name VARCHAR(120) NOT NULL CHECK(length(trim(name))>0),
 phone VARCHAR(30), email VARCHAR(160), city VARCHAR(100),
 source VARCHAR(20) NOT NULL CHECK(source IN ('website','whatsapp','instagram','facebook','referral','walkin','other')),
 vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
 vehicle_label VARCHAR(180),
 budget NUMERIC(14,2) CHECK(budget>0 AND budget<=100000000),
 next_contact_date DATE, notes VARCHAR(2000),
 status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacting','qualified','lost','converted')),
 loss_reason VARCHAR(500),
 customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((status='converted')=(customer_id IS NOT NULL)),
 CHECK((status='lost')=(loss_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS leads_followup_idx ON leads(next_contact_date) WHERE status IN ('new','contacting','qualified');
CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads(customer_id);
CREATE TABLE IF NOT EXISTS lead_events (
 id SERIAL PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
 event_type VARCHAR(30) NOT NULL,
 content VARCHAR(2000) NOT NULL, created_by INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON lead_events(lead_id,id DESC);
COMMIT;
