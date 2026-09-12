BEGIN;

-- Especificações técnicas preenchíveis manualmente ou via IA
-- (rota POST /api/ai/vehicle-specs). Todas nullable: só existem
-- quando informadas com confiança, nunca um valor inventado.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS top_speed INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS seats INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS trunk_capacity INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine VARCHAR(80);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS horsepower INTEGER;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_top_speed_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_top_speed_check
  CHECK (top_speed IS NULL OR (top_speed > 0 AND top_speed <= 500));

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_seats_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_seats_check
  CHECK (seats IS NULL OR (seats > 0 AND seats <= 9));

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_trunk_capacity_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_trunk_capacity_check
  CHECK (trunk_capacity IS NULL OR (trunk_capacity >= 0 AND trunk_capacity <= 3000));

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_horsepower_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_horsepower_check
  CHECK (horsepower IS NULL OR (horsepower > 0 AND horsepower <= 2000));

COMMIT;
