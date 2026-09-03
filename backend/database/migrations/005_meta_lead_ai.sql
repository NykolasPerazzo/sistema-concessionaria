BEGIN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_provider VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_lead_id VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_form_id VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_ad_id VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_text VARCHAR(1000);
CREATE UNIQUE INDEX IF NOT EXISTS leads_external_unique ON leads(external_provider, external_lead_id)
  WHERE external_provider IS NOT NULL AND external_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_ai_analyses (
 id SERIAL PRIMARY KEY,
 lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 intent VARCHAR(20) NOT NULL CHECK(intent IN ('low','medium','high')),
 urgency VARCHAR(20) NOT NULL CHECK(urgency IN ('low','medium','high')),
 summary VARCHAR(1000) NOT NULL,
 next_action VARCHAR(1000) NOT NULL,
 response_draft VARCHAR(2000) NOT NULL,
 model VARCHAR(120) NOT NULL,
 created_by INTEGER,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_ai_latest_idx ON lead_ai_analyses(lead_id,id DESC);

CREATE TABLE IF NOT EXISTS meta_webhook_events (
 id SERIAL PRIMARY KEY,
 external_event_key VARCHAR(250) NOT NULL UNIQUE,
 leadgen_id VARCHAR(120) NOT NULL,
 page_id VARCHAR(120), form_id VARCHAR(120), ad_id VARCHAR(120),
 payload JSONB NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 error_message VARCHAR(1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS meta_events_pending_idx ON meta_webhook_events(status,id);
COMMIT;
