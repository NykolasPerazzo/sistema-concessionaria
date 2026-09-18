/*
 * Regras e validações da área de Documentação. Mantido sem acesso a banco
 * (igual a lead-score.service.js) para ficar fácil de testar isoladamente.
 * Nenhuma regra aqui afirma validade jurídica: são checagens estruturais que
 * ajudam a preencher o documento corretamente.
 */

const DOCUMENT_TYPES = [
  "procuracao",
  "contrato_compra_venda",
  "recibo",
  "autorizacao",
];

const STATUSES = [
  "draft",
  "awaiting_signature",
  "completed",
  "issue",
  "cancelled",
];

// Estados a partir dos quais cada status pode ser alcançado via PATCH /status.
const ALLOWED_TRANSITIONS = {
  draft: ["awaiting_signature", "completed", "issue", "cancelled"],
  awaiting_signature: ["draft", "completed", "issue", "cancelled"],
  issue: ["draft", "awaiting_signature", "completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: [],
};

const TYPE_LABELS = {
  procuracao: "Procuração",
  contrato_compra_venda: "Contrato de compra e venda",
  recibo: "Recibo",
  autorizacao: "Autorização",
};

const MAX_JSON_KEYS = 40;
const MAX_JSON_STRING = 2000;

function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
}

function buildTitle(documentType, vehicleLabel) {
  const label = TYPE_LABELS[documentType] || "Documento";
  return vehicleLabel ? `${label} • ${vehicleLabel}` : label;
}

/*
 * Valida um objeto "raso" (sem aninhamento) usado nos campos JSONB
 * (participantes, snapshot do veículo, dados específicos do documento).
 * Só aceita string, number, boolean ou null como valor de cada chave —
 * suficiente para os formulários desta página e evita payloads arbitrários.
 */
function sanitizeFlatObject(value, { maxKeys = MAX_JSON_KEYS, maxStringLength = MAX_JSON_STRING } = {}) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const keys = Object.keys(value);
  if (keys.length > maxKeys) return null;

  const result = {};
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 80) return null;
    const raw = value[key];
    if (raw === null || raw === undefined) {
      result[key] = null;
      continue;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > maxStringLength) return null;
      result[key] = trimmed;
      continue;
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return null;
      result[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      result[key] = raw;
      continue;
    }
    return null;
  }
  return result;
}

function onlyDigits(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

// Checagem de formato (quantidade de dígitos), não substitui validação de dígito verificador.
function isPlausibleDocumentNumber(value) {
  if (!value) return true;
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}

module.exports = {
  DOCUMENT_TYPES,
  STATUSES,
  TYPE_LABELS,
  canTransition,
  buildTitle,
  sanitizeFlatObject,
  isPlausibleDocumentNumber,
};
