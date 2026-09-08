BEGIN;

-- Módulo Despachante (Fase 1): processos de documentação/serviços ligados a
-- um veículo e um cliente, opcionalmente a uma venda. Sem integração com
-- órgãos públicos nesta fase — fluxo manual, com linha do tempo própria
-- (mesmo formato de lead_events) e tabelas de checklist/financeiro/tarefas
-- já criadas para as próximas fases (010_dispatcher cobre o schema todo de
-- uma vez para não exigir nova migration na Fase 2).

CREATE TABLE IF NOT EXISTS dispatcher_processes (
  id SERIAL PRIMARY KEY,
  service_type VARCHAR(40) NOT NULL CHECK (service_type IN (
    'transferencia_propriedade','transferencia_municipio','primeiro_emplacamento',
    'licenciamento','comunicacao_venda','vistoria','segunda_via_documento',
    'regularizacao_debitos','baixa_inclusao_gravame','alteracao_cadastral','outro_servico'
  )),
  status VARCHAR(40) NOT NULL DEFAULT 'novo_processo' CHECK (status IN (
    'novo_processo','aguardando_documentos','documentacao_conferencia','documentacao_pendente',
    'aguardando_pagamento','vistoria_agendada','em_processamento','aguardando_orgao_publico',
    'concluido','cancelado','com_problema'
  )),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('baixa','normal','alta','urgente')),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_label VARCHAR(180),
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT,
  responsible_user_id INTEGER,
  estimated_value NUMERIC(14,2) CHECK (estimated_value IS NULL OR (estimated_value >= 0 AND estimated_value <= 100000000)),
  expected_deadline DATE,
  notes VARCHAR(2000),
  closed_at TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  CHECK ((status = 'cancelado') = (cancellation_reason IS NOT NULL)),
  CHECK ((status IN ('concluido','cancelado')) = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS dispatcher_processes_vehicle_idx ON dispatcher_processes(vehicle_id);
CREATE INDEX IF NOT EXISTS dispatcher_processes_customer_idx ON dispatcher_processes(customer_id);
CREATE INDEX IF NOT EXISTS dispatcher_processes_sale_idx ON dispatcher_processes(sale_id);
CREATE INDEX IF NOT EXISTS dispatcher_processes_status_idx ON dispatcher_processes(status);
CREATE INDEX IF NOT EXISTS dispatcher_processes_deadline_idx ON dispatcher_processes(expected_deadline)
  WHERE status NOT IN ('concluido','cancelado');
-- Evita dois processos ativos do mesmo serviço para a mesma venda (botão "Enviar para o despachante").
CREATE UNIQUE INDEX IF NOT EXISTS dispatcher_processes_active_sale_service
  ON dispatcher_processes(sale_id, service_type)
  WHERE sale_id IS NOT NULL AND status NOT IN ('concluido','cancelado');

-- Checklist padrão por tipo de serviço (editável apenas via banco por enquanto;
-- tela de configuração fica para uma fase seguinte). Serve de modelo copiado
-- para dispatcher_documents quando um processo é criado.
CREATE TABLE IF NOT EXISTS dispatcher_document_requirements (
  id SERIAL PRIMARY KEY,
  service_type VARCHAR(40) NOT NULL CHECK (service_type IN (
    'transferencia_propriedade','transferencia_municipio','primeiro_emplacamento',
    'licenciamento','comunicacao_venda','vistoria','segunda_via_documento',
    'regularizacao_debitos','baixa_inclusao_gravame','alteracao_cadastral','outro_servico'
  )),
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispatcher_document_requirements_type_idx
  ON dispatcher_document_requirements(service_type, sort_order);

INSERT INTO dispatcher_document_requirements(service_type, name, description, is_required, sort_order)
SELECT 'transferencia_propriedade', name, description, is_required, sort_order
FROM (VALUES
  ('Documento do comprador', 'RG ou CNH do comprador.', TRUE, 1),
  ('Documento do vendedor', 'RG ou CNH do vendedor.', TRUE, 2),
  ('Comprovante de endereço', NULL::VARCHAR, TRUE, 3),
  ('ATPV-e ou documento equivalente', NULL::VARCHAR, TRUE, 4),
  ('CRLV-e', NULL::VARCHAR, TRUE, 5),
  ('Contrato de compra e venda', NULL::VARCHAR, TRUE, 6),
  ('Procuração', 'Quando aplicável.', FALSE, 7),
  ('Comprovante de pagamento', NULL::VARCHAR, TRUE, 8),
  ('Laudo de vistoria', NULL::VARCHAR, TRUE, 9),
  ('Documentos adicionais', NULL::VARCHAR, FALSE, 10)
) AS seed(name, description, is_required, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM dispatcher_document_requirements WHERE service_type = 'transferencia_propriedade'
);

-- Item de checklist de um processo específico. Os campos de arquivo já
-- existem no schema, mas só passam a ser preenchidos quando o upload real
-- (Cloudinary com entrega privada) for implementado na Fase 2.
CREATE TABLE IF NOT EXISTS dispatcher_documents (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES dispatcher_processes(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES dispatcher_document_requirements(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente','enviado','em_analise','aprovado','rejeitado','nao_aplicavel'
  )),
  rejection_reason VARCHAR(500),
  file_url VARCHAR(500),
  file_public_id VARCHAR(255),
  file_name VARCHAR(255),
  file_mime VARCHAR(100),
  file_size INTEGER,
  submitted_at TIMESTAMPTZ,
  submitted_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'rejeitado') = (rejection_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS dispatcher_documents_process_idx ON dispatcher_documents(process_id);

-- Linha do tempo do processo (mesmo formato de lead_events), com colunas
-- extras só para status_changed guardar o antes/depois de forma consultável.
CREATE TABLE IF NOT EXISTS dispatcher_timeline (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES dispatcher_processes(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  content VARCHAR(2000) NOT NULL,
  previous_status VARCHAR(40),
  new_status VARCHAR(40),
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispatcher_timeline_process_idx ON dispatcher_timeline(process_id, id DESC);

-- Financeiro do processo (taxas, honorários, vistoria, despesas avulsas).
-- Tabela própria, nunca somada junto de vehicle_expenses: despesa de
-- despachante não é custo de aquisição do veículo. Sem rota/tela até a Fase 2.
CREATE TABLE IF NOT EXISTS dispatcher_expenses (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES dispatcher_processes(id) ON DELETE CASCADE,
  expense_type VARCHAR(20) NOT NULL CHECK (expense_type IN (
    'taxa_orgao','honorarios','vistoria','despesa_adicional'
  )),
  description VARCHAR(500),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_method VARCHAR(20) CHECK (payment_method IS NULL OR payment_method IN ('pix','transfer','cash','financing','mixed')),
  payment_date DATE,
  notes VARCHAR(1000),
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispatcher_expenses_process_idx ON dispatcher_expenses(process_id);

-- Próximas tarefas do processo (mesmo formato de lead_tasks). Sem rota/tela até a Fase 2.
CREATE TABLE IF NOT EXISTS dispatcher_tasks (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES dispatcher_processes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL CHECK (length(trim(title)) > 0),
  description VARCHAR(1000),
  due_date DATE,
  assigned_to INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by INTEGER NOT NULL,
  completed_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS dispatcher_tasks_process_idx ON dispatcher_tasks(process_id, status);

COMMIT;
