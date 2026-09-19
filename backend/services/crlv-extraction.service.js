/*
 * Chamada ao Gemini para ler um CRLV/CRLV-e (PDF, JPG ou PNG) e devolver
 * os dados do veículo em JSON estruturado.
 *
 * Privacidade: o arquivo é enviado ao Gemini apenas para esta leitura
 * pontual (sem Files API, sem armazenamento remoto permanente). Nunca
 * logamos o conteúdo do documento, o prompt completo ou a resposta
 * bruta do provedor — só o status HTTP em caso de erro.
 *
 * Este módulo só cuida da chamada à IA e do parsing do JSON retornado.
 * A revalidação/sanitização dos campos (nunca confiamos no schema da IA)
 * fica em crlv-sanitize.service.js, e a normalização de placa, RENAVAM,
 * chassi, combustível etc. fica em crlv-normalization.service.js.
 */

const EXTRACTION_TIMEOUT_MS = 25000;

class CrlvExtractionError extends Error {
  constructor(code, message) {
    super(message);

    this.name = "CrlvExtractionError";
    this.code = code;
  }
}

/* ==========================================
   MODELO CONFIGURADO
========================================== */

function resolveModel() {
  return process.env.GEMINI_CRLV_MODEL || process.env.GEMINI_MODEL || null;
}

function configured() {
  return Boolean(process.env.GEMINI_API_KEY) && Boolean(resolveModel());
}

/* ==========================================
   PROMPT
========================================== */

const EXTRACTION_PROMPT = `
Você é um extrator de dados de documentos veiculares brasileiros.

Analise exclusivamente o arquivo fornecido.

Determine se ele parece ser um CRLV ou CRLV-e. Não afirme autenticidade
jurídica. Você apenas realiza leitura visual do documento.

Extraia somente dados referentes ao VEÍCULO.

Nunca extraia ou devolva nome, CPF, CNPJ, endereço, filiação, assinatura
ou qualquer outro dado do proprietário ou de terceiros.

Nunca invente valores. Quando um campo estiver ausente, ilegível ou
incerto, retorne null nesse campo.

Preserve a diferença entre ano de fabricação (manufacture_year) e ano do
modelo (model_year) — nunca substitua um pelo outro.

A placa deve conter somente letras e números em maiúsculas, sem espaços
ou símbolos.

O RENAVAM deve conter somente dígitos.

O chassi deve conter somente letras e números em maiúsculas, sem espaços
ou símbolos.

Em marca/modelo, separe a marca do modelo quando isso puder ser feito com
segurança. Não invente uma versão comercial que não esteja escrita no
documento.

Para cada campo de "data", preencha o campo correspondente em
"confidence" com "alta", "media" ou "baixa", de acordo com a certeza da
leitura.

Se o documento não parecer ser um CRLV/CRLV-e, defina "is_crlv" como
false e "document_type" como "UNKNOWN".

Use "warnings" para descrever brevemente qualquer problema de leitura
(ex.: campo borrado, documento parcialmente cortado).

Retorne exclusivamente o JSON solicitado pelo schema, sem texto antes ou
depois, sem Markdown.
`.trim();

/* ==========================================
   JSON SCHEMA DA RESPOSTA ESTRUTURADA
========================================== */

const DATA_FIELD_NAMES = [
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

const INTEGER_FIELD_NAMES = [
  "manufacture_year",
  "model_year",
  "engine_displacement_cc",
  "horsepower",
];

function buildDataProperties() {
  const properties = {};

  for (const field of DATA_FIELD_NAMES) {
    properties[field] = {
      type: INTEGER_FIELD_NAMES.includes(field) ? "INTEGER" : "STRING",
      nullable: true,
    };
  }

  return properties;
}

function buildConfidenceProperties() {
  const properties = {};

  for (const field of DATA_FIELD_NAMES) {
    properties[field] = {
      type: "STRING",
      enum: ["alta", "media", "baixa"],
    };
  }

  return properties;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",

  properties: {
    is_crlv: { type: "BOOLEAN" },

    document_type: {
      type: "STRING",
      enum: ["CRLV", "CRLV_E", "UNKNOWN"],
    },

    data: {
      type: "OBJECT",
      properties: buildDataProperties(),
      required: DATA_FIELD_NAMES,
    },

    confidence: {
      type: "OBJECT",
      properties: buildConfidenceProperties(),
      required: DATA_FIELD_NAMES,
    },

    warnings: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },

  required: ["is_crlv", "document_type", "data", "confidence", "warnings"],
};

/* ==========================================
   PARSING TOLERANTE DO JSON DA IA
========================================== */

/*
  A IA às vezes envolve o JSON em blocos de código Markdown mesmo
  quando instruída a não fazer isso. Extraímos o JSON de forma
  tolerante antes de validar o formato.
*/
function extractJsonPayload(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  const candidate = fenced ? fenced[1] : text;

  return JSON.parse(candidate.trim());
}

/* ==========================================
   CHAMADA AO GEMINI
========================================== */

async function extract({ buffer, mimeType }) {
  if (!configured()) {
    throw new CrlvExtractionError(
      "NOT_CONFIGURED",
      "Integração com o Gemini não configurada.",
    );
  }

  const model = resolveModel();

  const base64 = buffer.toString("base64");

  const controller = new AbortController();

  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",

              parts: [
                { text: EXTRACTION_PROMPT },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],

          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),

        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error.name === "AbortError") {
      throw new CrlvExtractionError(
        "TIMEOUT",
        "Tempo de leitura do CRLV excedido.",
      );
    }

    throw new CrlvExtractionError(
      "PROVIDER_ERROR",
      "Falha de comunicação com o provedor de IA.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Nunca logamos o corpo da resposta do provedor — só o status.
    console.error("Erro Gemini (CRLV): status", response.status);

    if (response.status === 429 || response.status >= 500) {
      throw new CrlvExtractionError(
        "PROVIDER_UNAVAILABLE",
        "Provedor de IA temporariamente indisponível.",
      );
    }

    throw new CrlvExtractionError(
      "PROVIDER_ERROR",
      "O provedor de IA rejeitou a requisição.",
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new CrlvExtractionError(
      "INVALID_JSON",
      "A IA retornou um formato inesperado.",
    );
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new CrlvExtractionError(
      "EMPTY_RESPONSE",
      "A IA não retornou dados do documento.",
    );
  }

  let raw;

  try {
    raw = extractJsonPayload(text);
  } catch {
    throw new CrlvExtractionError(
      "INVALID_JSON",
      "A IA retornou um formato inesperado.",
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrlvExtractionError(
      "INVALID_JSON",
      "A IA retornou um formato inesperado.",
    );
  }

  return raw;
}

module.exports = {
  extract,
  configured,
  resolveModel,
  CrlvExtractionError,
};
