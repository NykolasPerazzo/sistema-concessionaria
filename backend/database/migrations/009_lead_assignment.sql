BEGIN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to INTEGER;
CREATE INDEX IF NOT EXISTS leads_assigned_idx ON leads(assigned_to);
COMMIT;
