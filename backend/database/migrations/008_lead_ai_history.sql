BEGIN;

-- Precisa aceitar NULL porque agora também registramos tentativas que falharam.
ALTER TABLE lead_ai_analyses ALTER COLUMN score DROP NOT NULL;
ALTER TABLE lead_ai_analyses ALTER COLUMN intent DROP NOT NULL;
ALTER TABLE lead_ai_analyses ALTER COLUMN urgency DROP NOT NULL;
ALTER TABLE lead_ai_analyses ALTER COLUMN summary DROP NOT NULL;
ALTER TABLE lead_ai_analyses ALTER COLUMN next_action DROP NOT NULL;
ALTER TABLE lead_ai_analyses ALTER COLUMN response_draft DROP NOT NULL;

ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ok'
  CHECK (status IN ('ok','error'));
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS error_message VARCHAR(500);
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20);
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS input_snapshot JSONB;
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS probable_objection VARCHAR(300);
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS advance_probability VARCHAR(20)
  CHECK (advance_probability IN ('low','medium','high'));
ALTER TABLE lead_ai_analyses ADD COLUMN IF NOT EXISTS score_justification VARCHAR(1000);

CREATE INDEX IF NOT EXISTS lead_ai_status_idx ON lead_ai_analyses(lead_id, status, id DESC);

COMMIT;
