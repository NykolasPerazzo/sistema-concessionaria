BEGIN;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
  CHECK (payment_method IN ('cash','financing'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS down_payment NUMERIC(14,2)
  CHECK (down_payment > 0 AND down_payment <= 100000000);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS desired_installment NUMERIC(14,2)
  CHECK (desired_installment > 0 AND desired_installment <= 100000000);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_trade_in BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_in_estimated_value NUMERIC(14,2)
  CHECK (trade_in_estimated_value > 0 AND trade_in_estimated_value <= 100000000);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS financing_pre_approved BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchase_timeframe VARCHAR(20)
  CHECK (purchase_timeframe IN ('immediate','7_days','30_days','90_days','research_only'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS declared_preferences JSONB NOT NULL DEFAULT '{}';

-- Tipo estruturado da interação, usado só quando lead_events.event_type = 'interaction'.
-- Mantém o texto livre em "content" (exibido na timeline) e o tipo em coluna própria
-- (usado pela pontuação), evitando ter que interpretar texto livre.
ALTER TABLE lead_events ADD COLUMN IF NOT EXISTS interaction_type VARCHAR(30);

CREATE TABLE IF NOT EXISTS lead_scores (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasons JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_scores_latest_idx ON lead_scores(lead_id, id DESC);

CREATE TABLE IF NOT EXISTS lead_tasks (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL CHECK (length(trim(title)) > 0),
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by INTEGER NOT NULL,
  completed_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lead_tasks_lead_idx ON lead_tasks(lead_id, status);

COMMIT;
