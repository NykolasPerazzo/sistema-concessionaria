BEGIN;

-- Módulo Documentação: procurações, contratos de compra e venda, recibos e
-- autorizações. O HTML nunca é armazenado — só dados estruturados
-- (document_data) usados para montar a prévia no frontend a cada renderização.
-- Sem integração oficial com cartório, Detran ou RENAVE: fluxo 100% manual,
-- confirmado pelo usuário antes de qualquer geração.

-- Campos de identificação do veículo usados nos documentos. Nullable: só
-- existem quando informados, nunca inventados na prévia (mostra "Não
-- informado" quando ausentes).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate VARCHAR(10);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS renavam VARCHAR(20);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis_number VARCHAR(30);

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN (
        'procuracao','contrato_compra_venda','recibo','autorizacao'
    )),
    title VARCHAR(180) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft','awaiting_signature','completed','issue','cancelled'
    )),
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL,
    participant_primary JSONB NOT NULL DEFAULT '{}'::jsonb,
    participant_secondary JSONB NOT NULL DEFAULT '{}'::jsonb,
    vehicle_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    document_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    operation_value NUMERIC(14,2) CHECK (operation_value IS NULL OR (operation_value > 0 AND operation_value <= 100000000)),
    issue_date DATE,
    expiration_date DATE,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CHECK ((status = 'cancelled') = (cancellation_reason IS NOT NULL)),
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_vehicle_id ON documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_sale_id ON documents(sale_id);

COMMIT;
