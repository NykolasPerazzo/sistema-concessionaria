const LUMA_BASE_URL = "https://agents.lumalabs.ai/v1";

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 45000;

/*
  Pesos calibrados para o pedido do usuário: preservar
  exatamente o veículo (modelo, cor, rodas, faróis,
  acessórios) e só substituir fundo/iluminação/enquadramento.
*/
const STYLE_PROMPTS = {
  white: "fundo de estúdio branco premium, limpo, uniforme e bem iluminado",
  gray: "fundo de estúdio cinza neutro de estúdio fotográfico, com iluminação suave e sombra sutil no chão",
  dark: "fundo de estúdio escuro esportivo, com iluminação dramática e reflexos sutis",
};

function configured() {
  return Boolean(process.env.LUMA_API_KEY);
}

function buildPrompt(style) {
  const styleText = STYLE_PROMPTS[style];

  return (
    "Edite esta foto real de um veículo para criar uma capa profissional de anúncio. " +
    "Preserve exatamente o modelo, a cor, a carroceria, as rodas, os faróis, os acessórios " +
    "e todos os detalhes originais do veículo. Remova o fundo original, corrija a iluminação, " +
    "melhore a perspectiva e centralize o carro em uma composição profissional. " +
    `Use um fundo de estúdio ${styleText}. ` +
    "Não altere o veículo, não invente detalhes, não adicione pessoas, textos, marcas, " +
    "logotipos ou veículos extras. Gere uma imagem limpa e realista no formato vertical 1080x1350."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
  Gera a capa profissional a partir de uma foto real (sourceImageUrl,
  já hospedada publicamente — a API exige uma URL ou base64, não aceita
  upload direto via multipart) e retorna a URL da imagem gerada
  (hospedagem temporária da própria Luma — quem chama deve subir o
  resultado em um storage permanente, ex.: Cloudinary).
*/
async function generateCoverImage({ sourceImageUrl, style }) {
  if (!configured()) {
    throw new Error("LUMA_NOT_CONFIGURED");
  }

  if (!STYLE_PROMPTS[style]) {
    throw new Error("INVALID_STYLE");
  }

  const createResponse = await fetch(`${LUMA_BASE_URL}/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
    },
    body: JSON.stringify({
      type: "image_edit",
      model: "uni-1",
      prompt: buildPrompt(style),
      source: {
        url: sourceImageUrl,
      },
    }),
  });

  const createData = await createResponse.json().catch(() => null);

  if (!createResponse.ok || !createData?.id) {
    console.error("Erro Luma (criar geração):", createData);

    if (createResponse.status === 402) {
      throw new Error("LUMA_OUT_OF_CREDITS");
    }

    throw new Error("LUMA_REQUEST_FAILED");
  }

  if (createData.state === "completed") {
    const imageUrl = createData.output?.[0]?.url;

    if (imageUrl) {
      return { imageUrl };
    }
  }

  const generationId = createData.id;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const statusResponse = await fetch(
      `${LUMA_BASE_URL}/generations/${generationId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        },
      },
    );

    const statusData = await statusResponse.json().catch(() => null);

    if (!statusResponse.ok) {
      console.error("Erro Luma (consultar status):", statusData);

      throw new Error("LUMA_STATUS_CHECK_FAILED");
    }

    if (statusData?.state === "completed") {
      const imageUrl = statusData.output?.[0]?.url;

      if (imageUrl) {
        return { imageUrl };
      }

      throw new Error("LUMA_GENERATION_FAILED");
    }

    if (statusData?.state === "failed") {
      console.error("Geração Luma falhou:", statusData?.failure_reason);

      throw new Error("LUMA_GENERATION_FAILED");
    }
  }

  throw new Error("LUMA_TIMEOUT");
}

module.exports = {
  configured,
  generateCoverImage,
  STYLES: Object.keys(STYLE_PROMPTS),
};
