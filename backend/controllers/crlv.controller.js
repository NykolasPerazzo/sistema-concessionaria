const pool = require("../database/connection");
const crlvExtractionService = require("../services/crlv-extraction.service");
const { sanitizeAiPayload } = require("../services/crlv-sanitize.service");
const {
  normalizeExtractedData,
} = require("../services/crlv-normalization.service");

/* ==========================================
   ERROS DA EXTRAÇÃO → STATUS HTTP
========================================== */

const ERROR_STATUS_BY_CODE = {
  NOT_CONFIGURED: 503,
  TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  EMPTY_RESPONSE: 502,
  INVALID_JSON: 502,
};

const ERROR_MESSAGE_BY_CODE = {
  NOT_CONFIGURED:
    "Leitura de CRLV indisponível: integração com o Gemini não configurada.",
  TIMEOUT: "A leitura do documento demorou demais. Tente novamente.",
  PROVIDER_UNAVAILABLE:
    "Serviço de leitura de CRLV temporariamente indisponível. Tente novamente em instantes.",
  PROVIDER_ERROR:
    "Não foi possível ler o documento agora. Tente novamente em instantes.",
  EMPTY_RESPONSE:
    "Não foi possível ler o documento agora. Tente novamente em instantes.",
  INVALID_JSON:
    "Não foi possível ler o documento agora. Tente novamente em instantes.",
};

/* ==========================================
   DUPLICIDADE (placa / RENAVAM / chassi)
========================================== */

function buildVehicleLabel(row) {
  const label = [row.brand, row.model].filter(Boolean).join(" ");

  return row.year ? `${label} ${row.year}`.trim() : label;
}

async function findDuplicates(normalizedData) {
  const { license_plate, renavam, chassis_number } = normalizedData;

  if (!license_plate && !renavam && !chassis_number) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT id, brand, model, year, license_plate, renavam, chassis_number
      FROM vehicles
      WHERE (license_plate IS NOT NULL AND license_plate = $1)
         OR (renavam IS NOT NULL AND renavam = $2)
         OR (chassis_number IS NOT NULL AND chassis_number = $3)
    `,
    [license_plate, renavam, chassis_number],
  );

  const duplicates = [];

  for (const row of result.rows) {
    const label = buildVehicleLabel(row);

    if (license_plate && row.license_plate === license_plate) {
      duplicates.push({
        field: "license_plate",
        vehicle_id: row.id,
        vehicle_label: label,
      });
    }

    if (renavam && row.renavam === renavam) {
      duplicates.push({
        field: "renavam",
        vehicle_id: row.id,
        vehicle_label: label,
      });
    }

    if (chassis_number && row.chassis_number === chassis_number) {
      duplicates.push({
        field: "chassis_number",
        vehicle_id: row.id,
        vehicle_label: label,
      });
    }
  }

  return duplicates;
}

/* ==========================================
   IMPORTAR CRLV
========================================== */

/*
  Esta rota SÓ lê o documento e devolve dados para revisão no
  formulário. Em nenhuma hipótese ela cria ou altera um registro em
  vehicles — quem decide cadastrar é o usuário, pelo fluxo normal de
  POST /api/vehicles.
*/
const importCrlv = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "Envie um CRLV em PDF, JPG ou PNG.",
      });
    }

    let raw;

    try {
      raw = await crlvExtractionService.extract({
        buffer: file.buffer,
        mimeType: file.verifiedMimeType || file.mimetype,
      });
    } catch (error) {
      const status = ERROR_STATUS_BY_CODE[error.code];

      if (!status) {
        console.error(
          "Erro inesperado na leitura do CRLV:",
          error.code || error.message,
        );

        return res.status(500).json({
          error: "Erro interno do servidor.",
        });
      }

      return res.status(status).json({
        error: ERROR_MESSAGE_BY_CODE[error.code],
      });
    }

    const sanitized = sanitizeAiPayload(raw);

    if (!sanitized.is_crlv) {
      return res.status(422).json({
        error: "O arquivo não parece ser um CRLV válido ou legível.",
      });
    }

    const normalized = normalizeExtractedData(sanitized);

    const duplicates = await findDuplicates(normalized.data);

    const needsReview =
      normalized.warnings.length > 0 ||
      duplicates.length > 0 ||
      Object.values(normalized.confidence).some((level) => level !== "alta");

    return res.status(200).json({
      success: true,
      document_type: sanitized.document_type,
      data: normalized.data,
      confidence: normalized.confidence,
      warnings: normalized.warnings,
      duplicates,
      needs_review: needsReview,
    });
  } catch (error) {
    console.error("Erro ao importar CRLV:", error.message);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  } finally {
    // O conteúdo do CRLV nunca é persistido: descarta a referência ao
    // buffer explicitamente ao final da requisição.
    if (req.file) {
      req.file.buffer = null;
    }
  }
};

module.exports = {
  importCrlv,
};
