/*
 * Nunca confiamos apenas no JSON Schema pedido à IA: tudo que vem do
 * Gemini é revalidado aqui campo a campo antes de seguir para a
 * normalização e para o formulário do admin.
 *
 * Esta é também a barreira de privacidade: só os campos do VEÍCULO
 * listados em DATA_FIELDS são lidos de "data". Qualquer outra chave que
 * a IA eventualmente devolva (nome, CPF, endereço do proprietário etc.)
 * é ignorada — nunca chega ao restante da aplicação.
 */

const CONFIDENCE_LEVELS = ["alta", "media", "baixa"];

const DOCUMENT_TYPES = ["CRLV", "CRLV_E", "UNKNOWN"];

const DATA_FIELDS = [
  "license_plate",
  "renavam",
  "chassis_number",
  "brand",
  "model",
  "manufacture_year",
  "model_year",
  "color",
  "fuel",
  "vehicle_type",
  "species",
  "category",
  "engine_displacement_cc",
  "horsepower",
];

const NUMBER_FIELDS = [
  "manufacture_year",
  "model_year",
  "engine_displacement_cc",
  "horsepower",
];

const MAX_WARNINGS = 20;
const MAX_WARNING_LENGTH = 300;

function sanitizeAiPayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  const is_crlv = source.is_crlv === true;

  const document_type = DOCUMENT_TYPES.includes(source.document_type)
    ? source.document_type
    : "UNKNOWN";

  const rawData =
    source.data && typeof source.data === "object" ? source.data : {};

  const rawConfidence =
    source.confidence && typeof source.confidence === "object"
      ? source.confidence
      : {};

  const data = {};
  const confidence = {};

  for (const field of DATA_FIELDS) {
    const value = rawData[field];

    if (NUMBER_FIELDS.includes(field)) {
      const number = Number(value);

      data[field] =
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isInteger(number)
          ? number
          : null;
    } else {
      data[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    }

    confidence[field] = CONFIDENCE_LEVELS.includes(rawConfidence[field])
      ? rawConfidence[field]
      : "baixa";
  }

  const warnings = Array.isArray(source.warnings)
    ? source.warnings
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim().slice(0, MAX_WARNING_LENGTH))
        .slice(0, MAX_WARNINGS)
    : [];

  return { is_crlv, document_type, data, confidence, warnings };
}

module.exports = {
  sanitizeAiPayload,
  DATA_FIELDS,
};
