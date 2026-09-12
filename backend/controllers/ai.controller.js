const crypto = require("crypto");

const pool = require("../database/connection");
const cloudinaryService = require("../services/cloudinary.service");
const lumaService = require("../services/luma.service");

/* ==========================================
   IA - PERGUNTAS SOBRE O ESTOQUE
========================================== */

const askVehicleAI = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Digite uma pergunta.",
      });
    }

    /* ======================================
           BUSCAR ESTOQUE
        ====================================== */

    const result = await pool.query(`
            SELECT
                id,
                brand,
                model,
                year,
                price,
                purchase_price,
                entry_date,
                mileage,
                status
            FROM vehicles
            ORDER BY id DESC
        `);

    const vehicles = result.rows;

    /* ======================================
           PREPARAR DADOS
        ====================================== */

    const today = new Date();

    const stockData = vehicles.map((vehicle) => {
      let daysInStock = null;

      if (vehicle.entry_date) {
        const entryDate = new Date(vehicle.entry_date);

        daysInStock = Math.max(
          0,
          Math.floor((today - entryDate) / (1000 * 60 * 60 * 24)),
        );
      }

      let margin = null;

      if (Number(vehicle.purchase_price) > 0 && Number(vehicle.price) > 0) {
        margin =
          ((Number(vehicle.price) - Number(vehicle.purchase_price)) /
            Number(vehicle.purchase_price)) *
          100;
      }

      return {
        id: vehicle.id,

        vehicle: `${vehicle.brand} ${vehicle.model}`,

        year: vehicle.year,

        price: Number(vehicle.price),

        purchasePrice: vehicle.purchase_price
          ? Number(vehicle.purchase_price)
          : null,

        mileage: vehicle.mileage ? Number(vehicle.mileage) : null,

        status: vehicle.status,

        daysInStock,

        margin: margin !== null ? Number(margin.toFixed(2)) : null,
      };
    });

    /* ======================================
           PROMPT
        ====================================== */

    const prompt = `
Você é o assistente de gestão do sistema Car Dealer IA.

Sua função é ajudar uma concessionária ou revenda de veículos
a interpretar os dados do estoque.

REGRAS:

- Responda somente com base nos dados fornecidos.
- Não invente veículos, valores ou informações.
- Responda em português do Brasil.
- Seja direto e profissional.
- Use valores em reais quando necessário.
- Quando houver margem, explique de forma simples.
- Considere veículos com muitos dias em estoque como possível atenção.
- Não diga que uma venda irá acontecer com certeza.
- Se não houver dados suficientes, informe isso claramente.
- Prefira respostas curtas, entre 2 e 5 parágrafos.

DADOS DO ESTOQUE:

${JSON.stringify(stockData, null, 2)}

PERGUNTA DO USUÁRIO:

${question}
        `;

    /* ======================================
           GEMINI
        ====================================== */

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      },
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Erro Gemini:", geminiData);

      return res.status(500).json({
        error: "Não foi possível consultar a IA.",
      });
    }

    const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      return res.status(500).json({
        error: "A IA não retornou uma resposta.",
      });
    }

    res.json({
      answer,
    });
  } catch (error) {
    console.error("Erro no assistente IA:", error);

    res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   IA - RECOMENDAÇÃO PÚBLICA (SITE)
========================================== */

const recommendVehicle = async (req, res) => {
  try {
    const { budget, usage, priority } = req.body || {};

    const budgetText = typeof budget === "string" ? budget.trim() : "";
    const usageText = typeof usage === "string" ? usage.trim() : "";
    const priorityText = typeof priority === "string" ? priority.trim() : "";

    if (!budgetText && !usageText) {
      return res.status(400).json({
        error: "Conte pelo menos o orçamento ou o uso principal do carro.",
      });
    }

    /* ======================================
           BUSCAR ESTOQUE DISPONÍVEL
           (sem dados internos de custo/margem)
        ====================================== */

    const result = await pool.query(`
            SELECT
                id,
                brand,
                model,
                year,
                price,
                mileage,
                fuel,
                transmission,
                body_type,
                color
            FROM vehicles
            WHERE status = 'available'
            ORDER BY id DESC
        `);

    const vehicles = result.rows;

    if (vehicles.length === 0) {
      return res.json({
        answer:
          "No momento não há veículos disponíveis no estoque para recomendar.",
      });
    }

    const stockData = vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicle: `${vehicle.brand} ${vehicle.model}`,
      year: vehicle.year,
      price: Number(vehicle.price),
      mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
      fuel: vehicle.fuel,
      transmission: vehicle.transmission,
      bodyType: vehicle.body_type,
      color: vehicle.color,
    }));

    /* ======================================
           PROMPT
        ====================================== */

    const prompt = `
Você é o assistente de vendas do site de uma revenda de veículos.

Sua função é recomendar, para um visitante do site, os veículos do
estoque abaixo que melhor combinam com o que ele descreveu.

REGRAS:

- Responda somente com base nos dados fornecidos.
- Não invente veículos, valores ou características.
- Responda em português do Brasil, em tom amigável e direto.
- Recomende no máximo 3 veículos, citando marca, modelo e ano.
- Explique em poucas palavras por que cada um combina com o que a pessoa descreveu.
- Se nenhum veículo combinar bem, diga isso com sinceridade e sugira o mais próximo.
- Não peça para o visitante se cadastrar ou falar com um vendedor.
- Use no máximo 3 parágrafos curtos.
- Não utilize Markdown.

ESTOQUE DISPONÍVEL:

${JSON.stringify(stockData, null, 2)}

O QUE O VISITANTE DESCREVEU:

Orçamento: ${budgetText || "não informado"}
Uso principal: ${usageText || "não informado"}
O que mais importa: ${priorityText || "não informado"}
        `;

    /* ======================================
           GEMINI
        ====================================== */

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      },
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Erro Gemini (recomendação):", geminiData);

      return res.status(500).json({
        error: "Não foi possível consultar a IA.",
      });
    }

    const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      return res.status(500).json({
        error: "A IA não retornou uma resposta.",
      });
    }

    res.json({
      answer: answer.trim(),
    });
  } catch (error) {
    console.error("Erro na recomendação pública:", error);

    res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

const generateVehicleDescription = async (req, res) => {
  try {
    const { brand, model, year, mileage, fuel, transmission, color, price } =
      req.body;

    if (!brand || !model) {
      return res.status(400).json({
        error: "Informe pelo menos a marca e o modelo.",
      });
    }

    const vehicleData = {
      brand,
      model,
      year: year || null,
      mileage: mileage || null,
      fuel: fuel || null,
      transmission: transmission || null,
      color: color || null,
      price: price || null,
    };

    const prompt = `
    Você é um assistente especializado em criar anúncios de veículos
    para concessionárias brasileiras.

    Crie uma descrição curta e comercial para o veículo abaixo.

    DADOS DO VEÍCULO:
    ${JSON.stringify(vehicleData, null, 2)}

    REGRAS:

    - Escreva em português do Brasil.
    - Utilize SOMENTE as informações fornecidas.
    - Não invente equipamentos ou opcionais.
    - Não invente estado de conservação.
    - Não invente características técnicas.
    - Não use informações externas sobre o modelo.
    - Escreva apenas 1 parágrafo.
    - Use no máximo 280 caracteres.
    - Seja direto, comercial e natural.
    - Evite frases genéricas e exageradas.
    - Não coloque título.
    - Não utilize Markdown.
    `;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      },
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Erro Gemini descrição:", geminiData);

      return res.status(500).json({
        error: "Não foi possível gerar a descrição.",
      });
    }

    const description = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!description) {
      return res.status(500).json({
        error: "A IA não retornou uma descrição.",
      });
    }

    return res.json({
      description: description.trim(),
    });
  } catch (error) {
    console.error("Erro ao gerar descrição:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   IA - ESPECIFICAÇÕES TÉCNICAS DO VEÍCULO
========================================== */

const SPECS_CONFIDENCE_LEVELS = ["alta", "media", "baixa"];

function nullOrFiniteNumber(value, { min, max, integer = true } = {}) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  if (integer && !Number.isInteger(number)) {
    return null;
  }

  if (min !== undefined && number < min) {
    return null;
  }

  if (max !== undefined && number > max) {
    return null;
  }

  return number;
}

function nullOrTrimmedString(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

/*
  A IA às vezes responde envolvendo o JSON em blocos de código
  Markdown mesmo quando instruída a não fazer isso. Extraímos o
  JSON de forma tolerante antes de validar o formato.
*/
function extractJsonPayload(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  const candidate = fenced ? fenced[1] : text;

  return JSON.parse(candidate.trim());
}

/*
  Nunca confiamos cegamente no que a IA devolve: cada campo é
  revalidado aqui. Qualquer valor fora do formato esperado vira
  null em vez de ser repassado para o formulário do admin.
*/
function sanitizeSpecsPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const confianca = SPECS_CONFIDENCE_LEVELS.includes(raw.confianca)
    ? raw.confianca
    : "baixa";

  return {
    velocidade_maxima_kmh: nullOrFiniteNumber(raw.velocidade_maxima_kmh, {
      min: 1,
      max: 500,
    }),

    capacidade_passageiros: nullOrFiniteNumber(raw.capacidade_passageiros, {
      min: 1,
      max: 9,
    }),

    capacidade_porta_malas_litros: nullOrFiniteNumber(
      raw.capacidade_porta_malas_litros,
      { min: 0, max: 3000 },
    ),

    combustivel: nullOrTrimmedString(raw.combustivel, 40),

    cambio: nullOrTrimmedString(raw.cambio, 40),

    motorizacao: nullOrTrimmedString(raw.motorizacao, 80),

    potencia_cv: nullOrFiniteNumber(raw.potencia_cv, { min: 1, max: 2000 }),

    confianca,

    observacao: nullOrTrimmedString(raw.observacao, 500),
  };
}

const generateVehicleSpecs = async (req, res) => {
  try {
    const { brand, model, year, version, engine } = req.body || {};

    const brandText = typeof brand === "string" ? brand.trim() : "";
    const modelText = typeof model === "string" ? model.trim() : "";
    const versionText = typeof version === "string" ? version.trim() : "";
    const engineText = typeof engine === "string" ? engine.trim() : "";

    const yearNumber = Number(year);

    const currentYear = new Date().getFullYear();

    if (!brandText || !modelText) {
      return res.status(400).json({
        error: "Informe marca e modelo do veículo.",
      });
    }

    if (
      !Number.isInteger(yearNumber) ||
      yearNumber < 1886 ||
      yearNumber > currentYear + 2
    ) {
      return res.status(400).json({
        error: "Informe um ano de fabricação válido.",
      });
    }

    const vehicleData = {
      marca: brandText,
      modelo: modelText,
      ano: yearNumber,
      versao: versionText || null,
      motorizacao_informada: engineText || null,
    };

    const prompt = `
Você é um especialista técnico em veículos automotores vendidos no Brasil.

Sua tarefa é preencher especificações técnicas de um veículo com base
SOMENTE no que você sabe com segurança sobre a marca, modelo, ano e
versão/motorização informados abaixo.

DADOS DO VEÍCULO:
${JSON.stringify(vehicleData, null, 2)}

REGRAS OBRIGATÓRIAS:

- Nunca invente especificações. Se não tiver certeza, use null.
- Se existir mais de uma versão/motorização para esse modelo/ano e não for
  possível identificar qual delas com segurança a partir dos dados
  informados, retorne null nos campos afetados e explique em "observacao"
  quais dados adicionais (versão, motorização, etc.) resolveriam a dúvida.
- "velocidade_maxima_kmh" deve ser um número inteiro em km/h, sem texto,
  sem unidade. Nunca estime; use somente se for um dado técnico conhecido.
- "capacidade_passageiros" é a quantidade de PESSOAS que o veículo
  transporta (geralmente 5), nunca a capacidade do porta-malas.
- "capacidade_porta_malas_litros" só deve ser preenchido se você tiver
  certeza da capacidade em litros do porta-malas dessa versão.
- "combustivel" e "cambio" devem refletir o padrão dessa versão/motorização.
- "potencia_cv" é a potência em cavalos (CV), apenas se for um dado
  técnico confiável para essa versão específica.
- "confianca" só pode ser "alta", "media" ou "baixa":
  * "alta": você tem certeza dos dados preenchidos para essa versão exata.
  * "media": os dados são prováveis, mas a versão/motorização não foi
    identificada com total precisão.
  * "baixa": pouca certeza; a maioria dos campos deve ser null.
- Se não houver certeza suficiente para um campo, use null nele e explique
  o motivo em "observacao" (ex.: "Não é possível confirmar sem saber a
  motorização exata: 1.0, 1.6 ou 2.0").
- Não use dados fictícios como fallback.
- Responda em português do Brasil.

FORMATO DE RESPOSTA (responda SOMENTE este JSON, sem texto antes ou depois,
sem Markdown):

{
  "velocidade_maxima_kmh": 0,
  "capacidade_passageiros": 0,
  "capacidade_porta_malas_litros": null,
  "combustivel": null,
  "cambio": null,
  "motorizacao": null,
  "potencia_cv": null,
  "confianca": "alta",
  "observacao": null
}
    `;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Erro Gemini especificações:", geminiData);

      return res.status(500).json({
        error: "Não foi possível consultar a IA.",
      });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({
        error: "A IA não retornou especificações.",
      });
    }

    let parsed;

    try {
      parsed = extractJsonPayload(rawText);
    } catch (error) {
      console.error("Resposta da IA fora do formato JSON esperado:", rawText);

      return res.status(502).json({
        error:
          "A IA retornou um formato inesperado. Tente novamente em instantes.",
      });
    }

    const specs = sanitizeSpecsPayload(parsed);

    if (!specs) {
      return res.status(502).json({
        error:
          "A IA retornou um formato inesperado. Tente novamente em instantes.",
      });
    }

    return res.json(specs);
  } catch (error) {
    console.error("Erro ao buscar especificações com IA:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   IA - CAPA PROFISSIONAL DO VEÍCULO
========================================== */

const COVER_PENDING_FOLDER = "car-dealer/ai-covers/pending";

async function cleanupPending(publicIds) {
  await Promise.all(publicIds.map((id) => cloudinaryService.deleteAsset(id)));
}

const generateVehicleCover = async (req, res) => {
  const pendingPublicIds = [];

  try {
    const style = req.body?.style;

    if (!lumaService.STYLES.includes(style)) {
      return res.status(400).json({
        error: "Estilo inválido. Escolha branco, cinza ou escuro.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Envie uma foto real do veículo.",
      });
    }

    if (!cloudinaryService.configured()) {
      return res.status(503).json({
        error:
          "Geração de capa indisponível: integração com Cloudinary não configurada.",
      });
    }

    if (!lumaService.configured()) {
      return res.status(503).json({
        error:
          "Geração de capa indisponível: integração com a IA de imagem (Luma) não configurada. Defina LUMA_API_KEY no ambiente do servidor.",
      });
    }

    const token = crypto.randomBytes(8).toString("hex");

    const sourceUpload = await cloudinaryService.uploadBuffer(
      req.file.buffer,
      {
        folder: COVER_PENDING_FOLDER,
        publicId: `${token}-source`,
      },
    );

    pendingPublicIds.push(sourceUpload.public_id);

    let generated;

    try {
      generated = await lumaService.generateCoverImage({
        sourceImageUrl: sourceUpload.secure_url,
        style,
      });
    } catch (error) {
      await cleanupPending(pendingPublicIds);

      console.error("Erro ao gerar capa com IA:", error.message);

      if (error.message === "LUMA_TIMEOUT") {
        return res.status(504).json({
          error: "A geração da imagem demorou demais. Tente novamente.",
        });
      }

      if (error.message === "LUMA_OUT_OF_CREDITS") {
        return res.status(503).json({
          error:
            "Sem créditos suficientes na conta da IA de imagem (Luma). Verifique o saldo em lumalabs.ai.",
        });
      }

      if (error.message === "LUMA_GENERATION_FAILED") {
        return res.status(502).json({
          error: "A IA não conseguiu gerar a imagem. Tente outra foto.",
        });
      }

      return res.status(502).json({
        error: "Falha ao gerar a capa com IA. Tente novamente em instantes.",
      });
    }

    /*
      A imagem gerada fica hospedada temporariamente pela
      Luma — baixamos e subimos no Cloudinary para termos
      uma URL permanente antes de responder ao frontend.
    */
    const resultResponse = await fetch(generated.imageUrl);

    if (!resultResponse.ok) {
      await cleanupPending(pendingPublicIds);

      return res.status(502).json({
        error: "Não foi possível obter a imagem gerada pela IA.",
      });
    }

    const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());

    const finalUpload = await cloudinaryService.uploadBuffer(resultBuffer, {
      folder: COVER_PENDING_FOLDER,
      publicId: `${token}-${style}`,
    });

    // A foto original só servia de referência para a IA.
    await cloudinaryService.deleteAsset(sourceUpload.public_id);

    return res.status(200).json({
      success: true,
      style,
      image_url: finalUpload.secure_url,
      public_id: finalUpload.public_id,
    });
  } catch (error) {
    await cleanupPending(pendingPublicIds);

    console.error("Erro ao gerar capa profissional com IA:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

module.exports = {
  askVehicleAI,
  recommendVehicle,
  generateVehicleDescription,
  generateVehicleSpecs,
  generateVehicleCover,
};
