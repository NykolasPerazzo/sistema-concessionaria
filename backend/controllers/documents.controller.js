const pool = require("../database/connection");
const {
  validId,
  textValue,
  money,
  validDate,
  fail,
  transaction,
} = require("./sales.controller");
const {
  DOCUMENT_TYPES,
  STATUSES,
  buildTitle,
  canTransition,
  sanitizeFlatObject,
  isPlausibleDocumentNumber,
} = require("../services/documents.service");

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;

function respondError(res, error) {
  if (!error.status)
    console.error(
      "Erro na área de documentação:",
      error.code || error.message,
    );
  return res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação de documentos.",
  });
}

function optionalId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!validId(value)) return undefined; // sinaliza inválido para o chamador
  return Number(value);
}

function validParticipant(value, { required }) {
  const sanitized = sanitizeFlatObject(value, { maxStringLength: 500 });
  if (sanitized === null) throw fail(400, "Dados do participante inválidos.");
  const name = typeof sanitized.name === "string" ? sanitized.name.trim() : "";
  if (required && !name) throw fail(400, "Informe o nome do participante.");
  if (name.length > 160) throw fail(400, "Nome do participante muito longo.");
  if (sanitized.document && !isPlausibleDocumentNumber(sanitized.document)) {
    throw fail(
      400,
      "CPF/CNPJ inválido: confira a quantidade de dígitos (11 ou 14).",
    );
  }
  return sanitized;
}

function validateCore(body) {
  if (!DOCUMENT_TYPES.includes(body.document_type))
    throw fail(400, "Tipo de documento inválido.");

  const vehicleId = optionalId(body.vehicle_id);
  if (vehicleId === undefined) throw fail(400, "Veículo inválido.");

  const clientId = optionalId(body.client_id);
  if (clientId === undefined) throw fail(400, "Cliente inválido.");

  const saleId = optionalId(body.sale_id);
  if (saleId === undefined) throw fail(400, "Venda inválida.");

  const participantPrimary = validParticipant(body.participant_primary, {
    required: true,
  });
  const participantSecondary = validParticipant(body.participant_secondary, {
    required: false,
  });

  const vehicleSnapshot = sanitizeFlatObject(body.vehicle_snapshot, {
    maxStringLength: 300,
  });
  if (vehicleSnapshot === null)
    throw fail(400, "Dados do veículo inválidos.");

  const documentData = sanitizeFlatObject(body.document_data, {
    maxStringLength: 2000,
  });
  if (documentData === null) throw fail(400, "Dados do documento inválidos.");

  let operationValue = null;
  if (
    body.operation_value !== undefined &&
    body.operation_value !== null &&
    body.operation_value !== ""
  ) {
    if (!money(body.operation_value))
      throw fail(400, "Valor da operação inválido.");
    operationValue = body.operation_value;
  }

  if (!validDate(body.issue_date))
    throw fail(400, "Data de emissão inválida.");

  let expirationDate = null;
  if (
    body.expiration_date !== undefined &&
    body.expiration_date !== null &&
    body.expiration_date !== ""
  ) {
    if (!validDate(body.expiration_date))
      throw fail(400, "Validade inválida.");
    if (body.expiration_date < body.issue_date)
      throw fail(400, "A validade não pode ser anterior à emissão.");
    expirationDate = body.expiration_date;
  }

  const title =
    textValue(body.title, 180) ||
    buildTitle(body.document_type, vehicleSnapshot.label || null);

  return {
    document_type: body.document_type,
    title,
    vehicle_id: vehicleId,
    client_id: clientId,
    sale_id: saleId,
    participant_primary: participantPrimary,
    participant_secondary: participantSecondary,
    vehicle_snapshot: vehicleSnapshot,
    document_data: documentData,
    operation_value: operationValue,
    issue_date: body.issue_date,
    expiration_date: expirationDate,
  };
}

const LIST_SELECT = `
  SELECT d.*, d.issue_date::text AS issue_date, d.expiration_date::text AS expiration_date,
    v.brand AS vehicle_brand, v.model AS vehicle_model, v.year AS vehicle_year,
    c.name AS client_name, u.name AS created_by_name
  FROM documents d
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  LEFT JOIN customers c ON c.id = d.client_id
  LEFT JOIN users u ON u.id = d.created_by
`;

async function getSummary(req, res) {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS generated_this_month,
        COUNT(*) FILTER (WHERE status='awaiting_signature') AS awaiting_signature,
        COUNT(*) FILTER (WHERE status='completed') AS completed,
        COUNT(*) FILTER (WHERE status='issue') AS with_issues
       FROM documents`,
    );
    const row = result.rows[0];
    res.json({
      generatedThisMonth: Number(row.generated_this_month),
      awaitingSignature: Number(row.awaiting_signature),
      completed: Number(row.completed),
      withIssues: Number(row.with_issues),
    });
  } catch (error) {
    respondError(res, error);
  }
}

async function listDocuments(req, res) {
  try {
    const { search = "", type = "all", status = "all", start, end } =
      req.query;
    if (type !== "all" && !DOCUMENT_TYPES.includes(type))
      throw fail(400, "Tipo inválido.");
    if (status !== "all" && !STATUSES.includes(status))
      throw fail(400, "Status inválido.");
    if (
      (start && !validDate(start)) ||
      (end && !validDate(end)) ||
      (start && end && start > end)
    )
      throw fail(400, "Período inválido.");
    if (typeof search !== "string" || search.length > 160)
      throw fail(400, "Busca inválida.");

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE),
    );
    const offset = (page - 1) * pageSize;
    const searchPattern = `%${search.trim()}%`;

    const result = await pool.query(
      `SELECT d.*, d.issue_date::text AS issue_date, d.expiration_date::text AS expiration_date,
        v.brand AS vehicle_brand, v.model AS vehicle_model, v.year AS vehicle_year,
        c.name AS client_name, u.name AS created_by_name,
        COUNT(*) OVER() AS total_count
       FROM documents d
       LEFT JOIN vehicles v ON v.id = d.vehicle_id
       LEFT JOIN customers c ON c.id = d.client_id
       LEFT JOIN users u ON u.id = d.created_by
       WHERE ($1='all' OR d.document_type=$1)
       AND ($2='all' OR d.status=$2)
       AND ($3::date IS NULL OR d.created_at::date >= $3)
       AND ($4::date IS NULL OR d.created_at::date <= $4)
       AND (d.title ILIKE $5
         OR COALESCE(d.participant_primary->>'name','') ILIKE $5
         OR COALESCE(d.participant_secondary->>'name','') ILIKE $5
         OR COALESCE(d.vehicle_snapshot->>'label','') ILIKE $5
         OR COALESCE(v.brand,'') ILIKE $5
         OR COALESCE(v.model,'') ILIKE $5
         OR COALESCE(c.name,'') ILIKE $5)
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT $6 OFFSET $7`,
      [type, status, start || null, end || null, searchPattern, pageSize, offset],
    );

    const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
    const documents = result.rows.map(({ total_count, ...row }) => row);

    res.json({
      documents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    respondError(res, error);
  }
}

async function getDocumentById(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    const result = await pool.query(`${LIST_SELECT} WHERE d.id=$1`, [
      req.params.id,
    ]);
    if (!result.rows[0]) throw fail(404, "Documento não encontrado.");
    res.json({ document: result.rows[0] });
  } catch (error) {
    respondError(res, error);
  }
}

async function createDocument(req, res) {
  try {
    const data = validateCore(req.body || {});
    const result = await pool.query(
      `INSERT INTO documents(
        document_type, title, vehicle_id, client_id, sale_id, created_by,
        participant_primary, participant_secondary, vehicle_snapshot, document_data,
        operation_value, issue_date, expiration_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *, issue_date::text AS issue_date, expiration_date::text AS expiration_date`,
      [
        data.document_type,
        data.title,
        data.vehicle_id,
        data.client_id,
        data.sale_id,
        req.user.sub,
        JSON.stringify(data.participant_primary),
        JSON.stringify(data.participant_secondary),
        JSON.stringify(data.vehicle_snapshot),
        JSON.stringify(data.document_data),
        data.operation_value,
        data.issue_date,
        data.expiration_date,
      ],
    );
    res.status(201).json({ document: result.rows[0] });
  } catch (error) {
    respondError(res, error);
  }
}

async function updateDocument(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    if (!validId(req.body?.version)) throw fail(400, "Versão inválida.");
    const data = validateCore(req.body || {});
    const result = await pool.query(
      `UPDATE documents SET
        document_type=$1, title=$2, vehicle_id=$3, client_id=$4, sale_id=$5,
        participant_primary=$6, participant_secondary=$7, vehicle_snapshot=$8, document_data=$9,
        operation_value=$10, issue_date=$11, expiration_date=$12, version=version+1, updated_at=NOW()
       WHERE id=$13 AND version=$14 AND status NOT IN ('completed','cancelled')
       RETURNING *, issue_date::text AS issue_date, expiration_date::text AS expiration_date`,
      [
        data.document_type,
        data.title,
        data.vehicle_id,
        data.client_id,
        data.sale_id,
        JSON.stringify(data.participant_primary),
        JSON.stringify(data.participant_secondary),
        JSON.stringify(data.vehicle_snapshot),
        JSON.stringify(data.document_data),
        data.operation_value,
        data.issue_date,
        data.expiration_date,
        req.params.id,
        req.body.version,
      ],
    );
    if (!result.rows[0]) {
      const existing = await pool.query(
        "SELECT status FROM documents WHERE id=$1",
        [req.params.id],
      );
      if (!existing.rows[0]) throw fail(404, "Documento não encontrado.");
      if (["completed", "cancelled"].includes(existing.rows[0].status))
        throw fail(
          409,
          "Documento concluído ou cancelado não pode ser editado.",
        );
      throw fail(
        409,
        "Documento atualizado em outra janela. Recarregue antes de editar.",
      );
    }
    res.json({ document: result.rows[0] });
  } catch (error) {
    respondError(res, error);
  }
}

async function setDocumentStatus(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    const { status, version, reason } = req.body || {};
    if (!STATUSES.includes(status)) throw fail(400, "Status inválido.");
    if (!validId(version)) throw fail(400, "Versão inválida.");

    const cancellationReason =
      status === "cancelled" ? textValue(reason, 500, true) : null;

    const document = await transaction(async (client) => {
      const current = await client.query(
        "SELECT * FROM documents WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      const doc = current.rows[0];
      if (!doc) throw fail(404, "Documento não encontrado.");
      if (doc.version !== Number(version))
        throw fail(
          409,
          "Documento atualizado em outra janela. Recarregue antes de continuar.",
        );
      if (doc.status === status)
        throw fail(409, "O documento já está neste status.");
      if (!canTransition(doc.status, status))
        throw fail(
          409,
          `Não é possível mudar o status de "${doc.status}" para "${status}".`,
        );
      const completedAt = status === "completed" ? new Date() : null;
      const cancelledAt = status === "cancelled" ? new Date() : null;
      const updated = await client.query(
        `UPDATE documents SET
          status=$1,
          version=version+1,
          updated_at=NOW(),
          completed_at=$2,
          cancelled_at=$3,
          cancellation_reason=$4
         WHERE id=$5
         RETURNING *, issue_date::text AS issue_date, expiration_date::text AS expiration_date`,
        [status, completedAt, cancelledAt, cancellationReason, req.params.id],
      );
      return updated.rows[0];
    });

    res.json({ document });
  } catch (error) {
    respondError(res, error);
  }
}

async function deleteDocument(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Documento inválido.");
    const result = await pool.query(
      "DELETE FROM documents WHERE id=$1 AND status <> 'completed' RETURNING id",
      [req.params.id],
    );
    if (!result.rows[0]) {
      const existing = await pool.query(
        "SELECT status FROM documents WHERE id=$1",
        [req.params.id],
      );
      if (!existing.rows[0]) throw fail(404, "Documento não encontrado.");
      throw fail(
        409,
        "Documentos concluídos não podem ser excluídos. Cancele-o, se necessário.",
      );
    }
    res.json({ message: "Documento excluído." });
  } catch (error) {
    respondError(res, error);
  }
}

module.exports = {
  getSummary,
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  setDocumentStatus,
  deleteDocument,
};
