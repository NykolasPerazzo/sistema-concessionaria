const pool = require("../database/connection");
const {
  transaction,
  validId,
  validDate,
  textValue,
  fail,
} = require("./sales.controller");

const SERVICE_TYPES = [
  "transferencia_propriedade",
  "transferencia_municipio",
  "primeiro_emplacamento",
  "licenciamento",
  "comunicacao_venda",
  "vistoria",
  "segunda_via_documento",
  "regularizacao_debitos",
  "baixa_inclusao_gravame",
  "alteracao_cadastral",
  "outro_servico",
];

const STATUSES = [
  "novo_processo",
  "aguardando_documentos",
  "documentacao_conferencia",
  "documentacao_pendente",
  "aguardando_pagamento",
  "vistoria_agendada",
  "em_processamento",
  "aguardando_orgao_publico",
  "concluido",
  "cancelado",
  "com_problema",
];

const PRIORITIES = ["baixa", "normal", "alta", "urgente"];

const DOCUMENT_STATUSES = [
  "pendente",
  "enviado",
  "em_analise",
  "aprovado",
  "rejeitado",
  "nao_aplicavel",
];

const CLOSED_STATUSES = ["concluido", "cancelado"];

const STATUS_LABELS = {
  novo_processo: "Novo processo",
  aguardando_documentos: "Aguardando documentos",
  documentacao_conferencia: "Documentação em conferência",
  documentacao_pendente: "Documentação pendente",
  aguardando_pagamento: "Aguardando pagamento",
  vistoria_agendada: "Vistoria agendada",
  em_processamento: "Em processamento",
  aguardando_orgao_publico: "Aguardando órgão público",
  concluido: "Concluído",
  cancelado: "Cancelado",
  com_problema: "Com problema",
};

const DOCUMENT_STATUS_LABELS = {
  pendente: "Pendente",
  enviado: "Enviado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  nao_aplicavel: "Não aplicável",
};

function respondError(res, error) {
  if (error.code === "23505")
    return res.status(409).json({
      error: "Já existe um processo ativo para esta venda e este serviço.",
    });
  if (!error.status)
    console.error("Erro na área de despachante:", error.code || error.message);
  return res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação do despachante.",
  });
}

function optionalId(value, label) {
  if (value == null || value === "") return null;
  if (!validId(value)) throw fail(400, `${label} inválido.`);
  return Number(value);
}

function optionalMoney(value, label) {
  if (value == null || value === "") return null;
  if (
    !["number", "string"].includes(typeof value) ||
    !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
    Number(value) > 100000000
  )
    throw fail(400, `${label} inválido.`);
  return value;
}

/*
 * Só administrador e despachante enxergam tudo. Financeiro tem leitura
 * ampla (vai precisar disso quando o financeiro do processo for ligado na
 * Fase 2). Vendedor só vê processos ligados a vendas suas ou, sem venda
 * vinculada, processos que ele mesmo abriu (ex.: a partir do próprio
 * cliente/veículo).
 */
function visibility(user, params) {
  if (["admin", "despachante", "financeiro"].includes(user.role))
    return { sql: "", params: [] };
  const index = params.length + 1;
  params.push(user.sub);
  return {
    sql: `AND (s.created_by = $${index} OR (p.sale_id IS NULL AND p.created_by = $${index}))`,
    params: [],
  };
}

function validateCore(body) {
  if (!SERVICE_TYPES.includes(body.service_type))
    throw fail(400, "Tipo de serviço inválido.");
  const priority = body.priority || "normal";
  if (!PRIORITIES.includes(priority)) throw fail(400, "Prioridade inválida.");
  const vehicleId = optionalId(body.vehicle_id, "Veículo");
  if (vehicleId === null) throw fail(400, "Veículo inválido.");
  const customerId = optionalId(body.customer_id, "Cliente");
  if (customerId === null) throw fail(400, "Cliente inválido.");
  const saleId = optionalId(body.sale_id, "Venda");
  const responsibleUserId = optionalId(body.responsible_user_id, "Responsável");
  const estimatedValue = optionalMoney(body.estimated_value, "Valor estimado");
  const deadline = body.expected_deadline || null;
  if (deadline !== null && !validDate(deadline))
    throw fail(400, "Prazo previsto inválido.");
  return {
    service_type: body.service_type,
    priority,
    vehicle_id: vehicleId,
    customer_id: customerId,
    sale_id: saleId,
    responsible_user_id: responsibleUserId,
    estimated_value: estimatedValue,
    expected_deadline: deadline,
    notes: textValue(body.notes, 2000),
  };
}

async function timelineEvent(client, processId, type, content, userId, extra = {}) {
  await client.query(
    `INSERT INTO dispatcher_timeline(process_id, event_type, content, previous_status, new_status, created_by)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [
      processId,
      type,
      content,
      extra.previousStatus || null,
      extra.newStatus || null,
      userId,
    ],
  );
}

async function seedChecklist(client, processId, serviceType, userId) {
  const requirements = await client.query(
    `SELECT * FROM dispatcher_document_requirements WHERE service_type=$1 ORDER BY sort_order, id`,
    [serviceType],
  );
  for (const requirement of requirements.rows) {
    await client.query(
      `INSERT INTO dispatcher_documents(process_id, requirement_id, name, description, is_required, created_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        processId,
        requirement.id,
        requirement.name,
        requirement.description,
        requirement.is_required,
        userId,
      ],
    );
  }
}

async function findVehicle(client, id) {
  const result = await client.query(
    `SELECT id, brand, model, year FROM vehicles WHERE id=$1 FOR KEY SHARE`,
    [id],
  );
  if (!result.rows[0]) throw fail(404, "Veículo não encontrado.");
  return result.rows[0];
}

async function findCustomer(client, id) {
  const result = await client.query(
    `SELECT * FROM customers WHERE id=$1 FOR SHARE`,
    [id],
  );
  const customer = result.rows[0];
  if (!customer || !customer.is_active)
    throw fail(409, "Cliente indisponível. Selecione um cadastro ativo.");
  return customer;
}

const PROJECTION = `
  p.*,
  p.expected_deadline::text AS expected_deadline,
  v.brand AS vehicle_brand, v.model AS vehicle_model, v.year AS vehicle_year,
  c.name AS customer_name, c.phone AS customer_phone,
  ru.name AS responsible_name,
  s.sale_date::text AS sale_date, s.buyer_name AS sale_buyer_name,
  (p.expected_deadline IS NOT NULL AND p.expected_deadline < CURRENT_DATE
    AND p.status NOT IN ('concluido','cancelado')) AS overdue,
  (SELECT COUNT(*) FROM dispatcher_documents d WHERE d.process_id = p.id
    AND d.is_required AND d.status NOT IN ('aprovado','nao_aplicavel')) AS pending_required_documents
`;

const JOINS = `
  FROM dispatcher_processes p
  JOIN vehicles v ON v.id = p.vehicle_id
  JOIN customers c ON c.id = p.customer_id
  LEFT JOIN sales s ON s.id = p.sale_id
  LEFT JOIN users ru ON ru.id = p.responsible_user_id
`;

async function getProcesses(req, res) {
  try {
    const q = req.query || {};
    const conditions = [];
    const params = [];
    function param(value) {
      params.push(value);
      return `$${params.length}`;
    }
    if (q.status) {
      if (!STATUSES.includes(q.status)) throw fail(400, "Status inválido.");
      conditions.push(`p.status = ${param(q.status)}`);
    }
    if (q.service_type) {
      if (!SERVICE_TYPES.includes(q.service_type))
        throw fail(400, "Tipo de serviço inválido.");
      conditions.push(`p.service_type = ${param(q.service_type)}`);
    }
    if (q.priority) {
      if (!PRIORITIES.includes(q.priority))
        throw fail(400, "Prioridade inválida.");
      conditions.push(`p.priority = ${param(q.priority)}`);
    }
    if (q.responsible) {
      if (!validId(q.responsible)) throw fail(400, "Responsável inválido.");
      conditions.push(`p.responsible_user_id = ${param(Number(q.responsible))}`);
    }
    if (q.customer) {
      if (!validId(q.customer)) throw fail(400, "Cliente inválido.");
      conditions.push(`p.customer_id = ${param(Number(q.customer))}`);
    }
    if (q.vehicle) {
      if (!validId(q.vehicle)) throw fail(400, "Veículo inválido.");
      conditions.push(`p.vehicle_id = ${param(Number(q.vehicle))}`);
    }
    if (q.overdue === "true") {
      conditions.push(
        "p.expected_deadline IS NOT NULL AND p.expected_deadline < CURRENT_DATE AND p.status NOT IN ('concluido','cancelado')",
      );
    }
    if (q.search) {
      const term = `%${String(q.search).trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(c.name) LIKE ${param(term)} OR LOWER(v.brand) LIKE ${param(term)} OR LOWER(v.model) LIKE ${param(term)} OR CAST(p.id AS TEXT) LIKE ${param(term)})`,
      );
    }
    const visible = visibility(req.user, params);
    const where = ["1=1", ...conditions, visible.sql.replace(/^AND /, "")].filter(
      Boolean,
    );
    const sql = `SELECT ${PROJECTION} ${JOINS} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC, p.id DESC`;
    const result = await pool.query(sql, params);
    res.json({ processes: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}

async function getProcessById(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Processo inválido.");
    const params = [req.params.id];
    const visible = visibility(req.user, params);
    const result = await pool.query(
      `SELECT ${PROJECTION} ${JOINS} WHERE p.id = $1 ${visible.sql}`,
      params,
    );
    const process = result.rows[0];
    if (!process) throw fail(404, "Processo não encontrado.");
    const documents = await pool.query(
      `SELECT * FROM dispatcher_documents WHERE process_id=$1 ORDER BY id`,
      [process.id],
    );
    const timeline = await pool.query(
      `SELECT * FROM dispatcher_timeline WHERE process_id=$1 ORDER BY id DESC`,
      [process.id],
    );
    res.json({
      process,
      documents: documents.rows,
      timeline: timeline.rows,
    });
  } catch (error) {
    respondError(res, error);
  }
}

async function createProcess(req, res) {
  try {
    const body = validateCore(req.body || {});
    const process = await transaction(async (client) => {
      const vehicle = await findVehicle(client, body.vehicle_id);
      await findCustomer(client, body.customer_id);
      let sale = null;
      if (body.sale_id !== null) {
        const saleResult = await client.query(
          `SELECT * FROM sales WHERE id=$1 FOR SHARE`,
          [body.sale_id],
        );
        sale = saleResult.rows[0];
        if (!sale) throw fail(404, "Venda não encontrada.");
        if (sale.cancelled_at) throw fail(409, "Esta venda foi cancelada.");
        if (sale.vehicle_id !== body.vehicle_id)
          throw fail(409, "A venda informada não corresponde ao veículo.");
      }
      if (body.responsible_user_id !== null) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE id=$1`,
          [body.responsible_user_id],
        );
        if (!userResult.rows[0]) throw fail(404, "Responsável não encontrado.");
      }
      const vehicleLabel = `${vehicle.brand} ${vehicle.model} • ${vehicle.year}`;
      const result = await client.query(
        `INSERT INTO dispatcher_processes(
          service_type, priority, vehicle_id, vehicle_label, customer_id, sale_id,
          responsible_user_id, estimated_value, expected_deadline, notes, created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          body.service_type,
          body.priority,
          body.vehicle_id,
          vehicleLabel,
          body.customer_id,
          body.sale_id,
          body.responsible_user_id,
          body.estimated_value,
          body.expected_deadline,
          body.notes,
          req.user.sub,
        ],
      );
      const saved = result.rows[0];
      await seedChecklist(client, saved.id, body.service_type, req.user.sub);
      await timelineEvent(client, saved.id, "created", "Processo criado.", req.user.sub);
      return saved;
    });
    res.status(201).json({ message: "Processo criado.", process });
  } catch (error) {
    respondError(res, error);
  }
}

async function lockedProcess(client, req) {
  if (!validId(req.params.id) || !validId(req.body?.version))
    throw fail(400, "Processo ou versão inválida.");
  const result = await client.query(
    `SELECT * FROM dispatcher_processes WHERE id=$1 FOR UPDATE`,
    [req.params.id],
  );
  const process = result.rows[0];
  if (!process) throw fail(404, "Processo não encontrado.");
  if (process.version !== Number(req.body.version))
    throw fail(409, "Este processo foi atualizado. Recarregue antes de continuar.");
  return process;
}

async function updateProcess(req, res) {
  try {
    const body = req.body || {};
    const priority = body.priority || "normal";
    if (!PRIORITIES.includes(priority)) throw fail(400, "Prioridade inválida.");
    const responsibleUserId = optionalId(body.responsible_user_id, "Responsável");
    const estimatedValue = optionalMoney(body.estimated_value, "Valor estimado");
    const deadline = body.expected_deadline || null;
    if (deadline !== null && !validDate(deadline))
      throw fail(400, "Prazo previsto inválido.");
    const notes = textValue(body.notes, 2000);
    await transaction(async (client) => {
      const process = await lockedProcess(client, req);
      if (CLOSED_STATUSES.includes(process.status))
        throw fail(409, "Processo encerrado. Não é possível editar.");
      if (responsibleUserId !== null) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE id=$1`,
          [responsibleUserId],
        );
        if (!userResult.rows[0]) throw fail(404, "Responsável não encontrado.");
      }
      await client.query(
        `UPDATE dispatcher_processes SET
          priority=$2, responsible_user_id=$3, estimated_value=$4,
          expected_deadline=$5, notes=$6, version=version+1, updated_at=NOW()
        WHERE id=$1`,
        [process.id, priority, responsibleUserId, estimatedValue, deadline, notes],
      );
      await timelineEvent(client, process.id, "updated", "Dados do processo atualizados.", req.user.sub);
    });
    res.json({ message: "Processo atualizado." });
  } catch (error) {
    respondError(res, error);
  }
}

async function deleteProcess(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Processo inválido.");
    const result = await pool.query(
      `DELETE FROM dispatcher_processes WHERE id=$1 RETURNING id`,
      [req.params.id],
    );
    if (!result.rows[0]) throw fail(404, "Processo não encontrado.");
    res.json({ message: "Processo excluído." });
  } catch (error) {
    respondError(res, error);
  }
}

async function changeStatus(req, res) {
  try {
    const target = req.body?.status;
    if (!STATUSES.includes(target)) throw fail(400, "Status inválido.");
    const note = textValue(req.body?.note, 500);
    await transaction(async (client) => {
      const process = await lockedProcess(client, req);
      if (CLOSED_STATUSES.includes(process.status))
        throw fail(409, "Processo encerrado. Não é possível alterar o status.");
      if (target === process.status)
        throw fail(400, "Selecione um status diferente do atual.");
      let cancellationReason = null;
      let closedAt = null;
      if (target === "cancelado") {
        cancellationReason = textValue(req.body?.reason, 500, true);
        closedAt = new Date();
      } else if (target === "concluido") {
        closedAt = new Date();
      }
      await client.query(
        `UPDATE dispatcher_processes SET status=$2, cancellation_reason=$3, closed_at=$4,
          version=version+1, updated_at=NOW() WHERE id=$1`,
        [process.id, target, cancellationReason, closedAt],
      );
      const observation = note || cancellationReason;
      const description = `${STATUS_LABELS[process.status]} → ${STATUS_LABELS[target]}${observation ? `: ${observation}` : ""}`;
      await timelineEvent(client, process.id, "status_changed", description, req.user.sub, {
        previousStatus: process.status,
        newStatus: target,
      });
    });
    res.json({ message: "Status atualizado." });
  } catch (error) {
    respondError(res, error);
  }
}

async function getDocuments(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Processo inválido.");
    const processCheck = await pool.query(
      `SELECT id FROM dispatcher_processes WHERE id=$1`,
      [req.params.id],
    );
    if (!processCheck.rows[0]) throw fail(404, "Processo não encontrado.");
    const result = await pool.query(
      `SELECT * FROM dispatcher_documents WHERE process_id=$1 ORDER BY id`,
      [req.params.id],
    );
    res.json({ documents: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}

async function addDocument(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Processo inválido.");
    const name = textValue(req.body?.name, 160, true);
    const description = textValue(req.body?.description, 500);
    const isRequired = req.body?.is_required !== false;
    const result = await transaction(async (client) => {
      const processResult = await client.query(
        `SELECT id, status FROM dispatcher_processes WHERE id=$1 FOR UPDATE`,
        [req.params.id],
      );
      const process = processResult.rows[0];
      if (!process) throw fail(404, "Processo não encontrado.");
      if (CLOSED_STATUSES.includes(process.status))
        throw fail(409, "Processo encerrado. Não é possível adicionar documentos.");
      const inserted = await client.query(
        `INSERT INTO dispatcher_documents(process_id, name, description, is_required, created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [process.id, name, description, isRequired, req.user.sub],
      );
      await timelineEvent(client, process.id, "document_added", `Documento adicionado ao checklist: ${name}.`, req.user.sub);
      return inserted.rows[0];
    });
    res.status(201).json({ document: result });
  } catch (error) {
    respondError(res, error);
  }
}

async function updateDocument(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    const status = req.body?.status;
    if (status !== undefined && !DOCUMENT_STATUSES.includes(status))
      throw fail(400, "Status de documento inválido.");
    const rejectionReason =
      status === "rejeitado"
        ? textValue(req.body?.rejection_reason, 500, true)
        : null;
    const hasName = req.body?.name !== undefined;
    const hasDescription = req.body?.description !== undefined;
    const hasRequiredFlag = req.body?.is_required !== undefined;
    const name = hasName ? textValue(req.body.name, 160, true) : null;
    const description = hasDescription
      ? textValue(req.body.description, 500)
      : null;
    await transaction(async (client) => {
      const docResult = await client.query(
        `SELECT * FROM dispatcher_documents WHERE id=$1 FOR UPDATE`,
        [req.params.id],
      );
      const document = docResult.rows[0];
      if (!document) throw fail(404, "Documento não encontrado.");
      const processResult = await client.query(
        `SELECT id, status FROM dispatcher_processes WHERE id=$1 FOR UPDATE`,
        [document.process_id],
      );
      const process = processResult.rows[0];
      if (CLOSED_STATUSES.includes(process.status))
        throw fail(409, "Processo encerrado. Não é possível alterar documentos.");
      const nextStatus = status || document.status;
      const submittedAt = nextStatus === "enviado" ? new Date() : document.submitted_at;
      const submittedBy = nextStatus === "enviado" ? req.user.sub : document.submitted_by;
      const reviewedAt = ["aprovado", "rejeitado"].includes(nextStatus)
        ? new Date()
        : document.reviewed_at;
      const reviewedBy = ["aprovado", "rejeitado"].includes(nextStatus)
        ? req.user.sub
        : document.reviewed_by;
      await client.query(
        `UPDATE dispatcher_documents SET
          status=$2, rejection_reason=$3, submitted_at=$4, submitted_by=$5,
          reviewed_at=$6, reviewed_by=$7,
          name=$8, description=$9,
          is_required=$10, updated_at=NOW()
        WHERE id=$1`,
        [
          document.id,
          nextStatus,
          rejectionReason,
          submittedAt,
          submittedBy,
          reviewedAt,
          reviewedBy,
          hasName ? name : document.name,
          hasDescription ? description : document.description,
          hasRequiredFlag ? req.body.is_required !== false : document.is_required,
        ],
      );
      if (status && status !== document.status) {
        let content;
        if (status === "rejeitado") content = `${document.name} rejeitado: ${rejectionReason}`;
        else if (status === "aprovado") content = `${document.name} aprovado.`;
        else content = `${document.name} marcado como "${DOCUMENT_STATUS_LABELS[status]}".`;
        await timelineEvent(
          client,
          document.process_id,
          status === "aprovado" ? "document_approved" : status === "rejeitado" ? "document_rejected" : "document_updated",
          content,
          req.user.sub,
        );
      }
    });
    res.json({ message: "Documento atualizado." });
  } catch (error) {
    respondError(res, error);
  }
}

async function deleteDocument(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    await transaction(async (client) => {
      const result = await client.query(
        `DELETE FROM dispatcher_documents WHERE id=$1 RETURNING *`,
        [req.params.id],
      );
      const document = result.rows[0];
      if (!document) throw fail(404, "Documento não encontrado.");
      await timelineEvent(client, document.process_id, "document_removed", `Documento removido do checklist: ${document.name}.`, req.user.sub);
    });
    res.json({ message: "Documento excluído." });
  } catch (error) {
    respondError(res, error);
  }
}

async function getTimeline(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Processo inválido.");
    const processCheck = await pool.query(
      `SELECT id FROM dispatcher_processes WHERE id=$1`,
      [req.params.id],
    );
    if (!processCheck.rows[0]) throw fail(404, "Processo não encontrado.");
    const result = await pool.query(
      `SELECT * FROM dispatcher_timeline WHERE process_id=$1 ORDER BY id DESC`,
      [req.params.id],
    );
    res.json({ timeline: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}

/*
 * Botão "Enviar para o despachante" na tela de venda. Reaproveita um
 * processo ativo já existente para a venda (de qualquer serviço) em vez de
 * criar outro, e preenche veículo/cliente automaticamente a partir da venda.
 */
async function createFromSale(req, res) {
  try {
    if (!validId(req.params.saleId)) throw fail(400, "Venda inválida.");
    const result = await transaction(async (client) => {
      const saleResult = await client.query(
        `SELECT * FROM sales WHERE id=$1 FOR SHARE`,
        [req.params.saleId],
      );
      const sale = saleResult.rows[0];
      if (!sale) throw fail(404, "Venda não encontrada.");
      if (sale.cancelled_at) throw fail(409, "Esta venda foi cancelada.");
      if (!sale.customer_id)
        throw fail(
          409,
          "Esta venda não possui cliente vinculado. Vincule um cliente antes de enviar ao despachante.",
        );
      const existing = await client.query(
        `SELECT * FROM dispatcher_processes WHERE sale_id=$1 AND status NOT IN ('concluido','cancelado')
         ORDER BY id DESC LIMIT 1`,
        [sale.id],
      );
      if (existing.rows[0]) return { process: existing.rows[0], created: false };
      const inserted = await client.query(
        `INSERT INTO dispatcher_processes(
          service_type, vehicle_id, vehicle_label, customer_id, sale_id, notes, created_by
        ) VALUES('transferencia_propriedade',$1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          sale.vehicle_id,
          sale.vehicle_label,
          sale.customer_id,
          sale.id,
          `Enviado a partir da venda #${sale.id}.`,
          req.user.sub,
        ],
      );
      const saved = inserted.rows[0];
      await seedChecklist(client, saved.id, "transferencia_propriedade", req.user.sub);
      await timelineEvent(client, saved.id, "created", `Processo criado a partir da venda #${sale.id}.`, req.user.sub);
      return { process: saved, created: true };
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    respondError(res, error);
  }
}

module.exports = {
  SERVICE_TYPES,
  STATUSES,
  PRIORITIES,
  DOCUMENT_STATUSES,
  getProcesses,
  getProcessById,
  createProcess,
  updateProcess,
  deleteProcess,
  changeStatus,
  getDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  getTimeline,
  createFromSale,
};
