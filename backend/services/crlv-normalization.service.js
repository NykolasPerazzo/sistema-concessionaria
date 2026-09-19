/*
 * Funções puras de normalização dos dados lidos do CRLV. Não fazem
 * nenhuma chamada de rede nem acessam o banco — só transformam e
 * validam o formato dos valores já sanitizados por
 * crlv-sanitize.service.js. Isso as torna fáceis de testar isoladamente.
 *
 * Nenhuma função aqui afirma ter validado o dado numa base oficial
 * (Detran/Senatran/RENAVE) — apenas aplica regras estruturais (formato,
 * tamanho, mapeamento de texto).
 */

const FUEL_ALIASES = {
  GASOLINA: "Gasolina",
  ETANOL: "Etanol",
  ALCOOL: "Etanol",
  "ALCOOL/ETANOL": "Etanol",
  "GASOLINA ETANOL": "Flex",
  "GASOLINA/ETANOL": "Flex",
  "ETANOL/GASOLINA": "Flex",
  "ALCOOL/GASOLINA": "Flex",
  "GASOLINA/ALCOOL": "Flex",
  FLEX: "Flex",
  DIESEL: "Diesel",
  ELETRICO: "Elétrico",
  "ELETRICO/GASOLINA": "Híbrido",
  HIBRIDO: "Híbrido",
};

function stripAccents(value) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* ==========================================
   PLACA
========================================== */

function normalizeLicensePlate(raw) {
  if (typeof raw !== "string") {
    return { value: null, warning: null };
  }

  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!cleaned) {
    return { value: null, warning: null };
  }

  const oldFormat = /^[A-Z]{3}[0-9]{4}$/;
  const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  if (oldFormat.test(cleaned) || mercosulFormat.test(cleaned)) {
    return { value: cleaned, warning: null };
  }

  if (cleaned.length >= 6 && cleaned.length <= 8) {
    return {
      value: cleaned,
      warning:
        "Placa fora do padrão esperado (antigo ou Mercosul); revise antes de salvar.",
    };
  }

  return {
    value: null,
    warning: "Não foi possível reconhecer a placa com segurança; revise o campo.",
  };
}

/* ==========================================
   RENAVAM
========================================== */

function normalizeRenavam(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, warning: null, lowConfidence: false };
  }

  const digits = String(raw).replace(/\D/g, "");

  if (!digits) {
    return { value: null, warning: null, lowConfidence: false };
  }

  if (digits.length === 11) {
    return { value: digits, warning: null, lowConfidence: false };
  }

  return {
    value: digits.slice(0, 20),
    warning: "RENAVAM fora do padrão de 11 dígitos; revise antes de salvar.",
    lowConfidence: true,
  };
}

/* ==========================================
   CHASSI
========================================== */

function normalizeChassisNumber(raw) {
  if (typeof raw !== "string") {
    return { value: null, warning: null, lowConfidence: false };
  }

  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!cleaned) {
    return { value: null, warning: null, lowConfidence: false };
  }

  if (cleaned.length === 17) {
    return { value: cleaned, warning: null, lowConfidence: false };
  }

  return {
    value: cleaned.slice(0, 30),
    warning:
      "Chassi com quantidade de caracteres fora do padrão (17); revise antes de salvar.",
    lowConfidence: true,
  };
}

/* ==========================================
   ANOS
========================================== */

function normalizeYear(raw) {
  const number = Number(raw);

  if (!Number.isInteger(number)) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  if (number < 1886 || number > currentYear + 2) {
    return null;
  }

  return number;
}

/* ==========================================
   COMBUSTÍVEL
========================================== */

function normalizeFuel(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return { value: null, warning: null };
  }

  const key = stripAccents(raw.trim().toUpperCase()).replace(/\s+/g, " ");

  const mapped = FUEL_ALIASES[key];

  if (mapped) {
    return { value: mapped, warning: null };
  }

  return {
    value: null,
    warning: `Combustível "${raw.trim()}" não pôde ser mapeado automaticamente; selecione manualmente.`,
  };
}

/* ==========================================
   MARCA E MODELO
========================================== */

function normalizeBrandModel(brandRaw, modelRaw) {
  const cleanup = (value) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  let brand = cleanup(brandRaw);
  let model = cleanup(modelRaw);
  let warning = null;

  if (!brand && model) {
    const parts = model.split(" ");

    if (parts.length > 1) {
      brand = parts[0];
      model = parts.slice(1).join(" ");
    }

    warning =
      "Não foi possível separar marca e modelo com segurança; revise antes de salvar.";
  }

  return {
    brand: brand ? brand.slice(0, 50) : null,
    model: model ? model.slice(0, 80) : null,
    warning,
  };
}

/* ==========================================
   TEXTO E NÚMEROS GENÉRICOS
========================================== */

function normalizeText(raw, maxLength) {
  if (typeof raw !== "string") {
    return null;
  }

  const cleaned = raw.replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeInteger(raw, min, max) {
  const number = Number(raw);

  if (!Number.isInteger(number) || number < min || number > max) {
    return null;
  }

  return number;
}

/* ==========================================
   NORMALIZAÇÃO COMPLETA
========================================== */

/*
  Recebe o payload já sanitizado (crlv-sanitize.service.js) e devolve os
  dados prontos para revisão no formulário: valores no formato esperado
  pelas colunas de vehicles, confiança ajustada quando a normalização
  encontra um formato inesperado, e avisos adicionais.
*/
function normalizeExtractedData(sanitized) {
  const { data, confidence } = sanitized;

  const warnings = [...sanitized.warnings];
  const finalConfidence = { ...confidence };

  const plate = normalizeLicensePlate(data.license_plate);
  if (plate.warning) warnings.push(plate.warning);
  if (!plate.value) finalConfidence.license_plate = "baixa";

  const renavam = normalizeRenavam(data.renavam);
  if (renavam.warning) warnings.push(renavam.warning);
  if (renavam.lowConfidence) finalConfidence.renavam = "baixa";

  const chassis = normalizeChassisNumber(data.chassis_number);
  if (chassis.warning) warnings.push(chassis.warning);
  if (chassis.lowConfidence) finalConfidence.chassis_number = "baixa";

  const {
    brand,
    model,
    warning: brandModelWarning,
  } = normalizeBrandModel(data.brand, data.model);
  if (brandModelWarning) warnings.push(brandModelWarning);

  const fuel = normalizeFuel(data.fuel);
  if (fuel.warning) warnings.push(fuel.warning);

  const normalizedData = {
    license_plate: plate.value,
    renavam: renavam.value,
    chassis_number: chassis.value,
    brand,
    model,
    manufacture_year: normalizeYear(data.manufacture_year),
    model_year: normalizeYear(data.model_year),
    color: normalizeText(data.color, 40),
    fuel: fuel.value,
    vehicle_type: normalizeText(data.vehicle_type, 60),
    species: normalizeText(data.species, 60),
    category: normalizeText(data.category, 60),
    engine_displacement_cc: normalizeInteger(data.engine_displacement_cc, 1, 10000),
    horsepower: normalizeInteger(data.horsepower, 1, 2000),
  };

  return {
    data: normalizedData,
    confidence: finalConfidence,
    warnings,
  };
}

module.exports = {
  normalizeLicensePlate,
  normalizeRenavam,
  normalizeChassisNumber,
  normalizeYear,
  normalizeFuel,
  normalizeBrandModel,
  normalizeText,
  normalizeInteger,
  normalizeExtractedData,
};
