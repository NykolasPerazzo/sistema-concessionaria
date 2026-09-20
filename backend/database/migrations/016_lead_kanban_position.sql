BEGIN;

-- Ordenação manual dos cards dentro de cada etapa do funil (quadro Kanban
-- de "Meus Leads", arrastar e soltar). A etapa em si continua sendo a
-- coluna "status" já existente (new/contacting/qualified/converted/lost) —
-- não criamos um novo conjunto de identificadores de etapa para não
-- duplicar a máquina de estados já usada em toda a área de leads
-- (conversão em cliente, motivo de perda, pontuação etc.).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Preenche a posição inicial pela ordem de criação, e só na primeira vez:
-- se algum lead já tiver posição diferente de zero, o quadro já foi
-- reorganizado manualmente (por um usuário arrastando cards) e essa
-- migration não deve sobrescrever essa ordem numa reexecução futura.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM leads WHERE position <> 0) THEN
    UPDATE leads l
    SET position = ordered.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at, id) - 1 AS rn
      FROM leads
    ) ordered
    WHERE l.id = ordered.id;
  END IF;
END $$;

-- Consultas do quadro sempre filtram por etapa e ordenam por posição.
CREATE INDEX IF NOT EXISTS leads_status_position_idx ON leads(status, position);

COMMIT;
