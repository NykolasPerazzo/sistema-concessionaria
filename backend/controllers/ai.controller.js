const pool = require("../database/connection");

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

module.exports = {
  askVehicleAI,
  generateVehicleDescription,
};
