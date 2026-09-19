BEGIN;

-- Importação de CRLV/CRLV-e: novas colunas guardam somente dados do
-- VEÍCULO lidos do documento (nunca dados do proprietário — nome, CPF,
-- endereço etc. não têm coluna aqui e nunca devem ser gravados).
-- Todas nullable: só existem quando lidas com confiança do documento
-- (pela IA) ou preenchidas manualmente, nunca inventadas.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS manufacture_year INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_vehicle_type VARCHAR(60);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_species VARCHAR(60);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS document_category VARCHAR(60);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_displacement_cc INTEGER;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_manufacture_year_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_manufacture_year_check
  CHECK (manufacture_year IS NULL OR (manufacture_year >= 1886 AND manufacture_year <= 2100));

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_engine_displacement_cc_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_engine_displacement_cc_check
  CHECK (engine_displacement_cc IS NULL OR (engine_displacement_cc > 0 AND engine_displacement_cc <= 10000));

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_document_vehicle_type_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_document_vehicle_type_check
  CHECK (document_vehicle_type IS NULL OR length(trim(document_vehicle_type)) > 0);

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_document_species_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_document_species_check
  CHECK (document_species IS NULL OR length(trim(document_species)) > 0);

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_document_category_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_document_category_check
  CHECK (document_category IS NULL OR length(trim(document_category)) > 0);

-- Normaliza valores vazios ("") para NULL antes de checar duplicidade,
-- para não travar a migração por causa de strings vazias herdadas.
UPDATE vehicles SET license_plate = NULL WHERE license_plate = '';
UPDATE vehicles SET renavam = NULL WHERE renavam = '';
UPDATE vehicles SET chassis_number = NULL WHERE chassis_number = '';

-- Antes de criar os índices únicos, detecta duplicidades já existentes
-- no estoque e falha com mensagem clara — nunca exclui ou altera dados
-- automaticamente. Corrija manualmente e rode a migração novamente.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT license_plate FROM vehicles
    WHERE license_plate IS NOT NULL
    GROUP BY license_plate HAVING COUNT(*) > 1
  ) duplicated_plates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % placa(s) duplicada(s) em vehicles. Corrija manualmente antes de aplicar esta migração.', dup_count;
  END IF;

  SELECT COUNT(*) INTO dup_count FROM (
    SELECT renavam FROM vehicles
    WHERE renavam IS NOT NULL
    GROUP BY renavam HAVING COUNT(*) > 1
  ) duplicated_renavam;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % RENAVAM duplicado(s) em vehicles. Corrija manualmente antes de aplicar esta migração.', dup_count;
  END IF;

  SELECT COUNT(*) INTO dup_count FROM (
    SELECT chassis_number FROM vehicles
    WHERE chassis_number IS NOT NULL
    GROUP BY chassis_number HAVING COUNT(*) > 1
  ) duplicated_chassis;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % chassi(s) duplicado(s) em vehicles. Corrija manualmente antes de aplicar esta migração.', dup_count;
  END IF;
END $$;

-- Índices únicos parciais: impedem corrida entre duas requisições de
-- cadastro concorrentes com a mesma placa/RENAVAM/chassi (violação vira
-- erro 23505, tratado como HTTP 409 nos controllers).
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_license_plate_unique
  ON vehicles (license_plate) WHERE license_plate IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_renavam_unique
  ON vehicles (renavam) WHERE renavam IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_chassis_number_unique
  ON vehicles (chassis_number) WHERE chassis_number IS NOT NULL;

COMMIT;
