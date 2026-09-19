BEGIN;

-- Permite marcar um veículo para aparecer na vitrine de destaques
-- da página inicial do site (seção "Veículos em destaque").
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

COMMIT;
