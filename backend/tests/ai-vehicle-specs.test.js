const { test } = require("node:test");
const assert = require("node:assert/strict");

// Não usa banco real: generateVehicleSpecs não consulta o banco, mas
// substituímos a conexão mesmo assim (mesmo padrão das outras fixtures)
// para garantir que nenhuma query real seria possível neste teste.
async function buildApp() {
  const connectionPath = require.resolve("../database/connection");
  require.cache[connectionPath] = {
    id: connectionPath,
    filename: connectionPath,
    loaded: true,
    exports: {
      query: async () => {
        throw new Error("Banco não deveria ser usado neste teste.");
      },
      connect: async () => {
        throw new Error("Banco não deveria ser usado neste teste.");
      },
    },
  };

  process.env.JWT_SECRET = "isolated-test-secret-not-for-production";

  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use(require("cookie-parser")());
  app.use("/api/ai", require("../routes/ai.routes"));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  const token = (role, sub = 1) =>
    require("jsonwebtoken").sign({ sub, role }, process.env.JWT_SECRET);

  async function request(route, { role = "admin", method = "POST", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (role) headers.Cookie = `token=${token(role)}`;
    const response = await fetch(url + route, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  return {
    server,
    url,
    request,
    close: () => new Promise((r) => server.close(r)),
  };
}

function geminiJsonResponse(payload) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("POST /api/ai/vehicle-specs: permissões e pistas do CRLV (cilindrada/potência)", async (t) => {
  const f = await buildApp();
  t.after(() => f.close());

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_MODEL = "gemini-test-model";

  const specsPayload = {
    velocidade_maxima_kmh: 185,
    capacidade_passageiros: 5,
    capacidade_porta_malas_litros: 373,
    combustivel: "Flex",
    cambio: "Automático",
    motorizacao: "1.0 12V TSI Flex",
    potencia_cv: 128,
    versao_identificada: "Sense 1.0 12V TSI Flex Automático",
    confianca: "alta",
    observacao: null,
  };

  let lastGeminiBody = null;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith(f.url)) return originalFetch(url, options);
    if (target.includes("generativelanguage.googleapis.com")) {
      lastGeminiBody = JSON.parse(options.body);
      return geminiJsonResponse(specsPayload);
    }
    return originalFetch(url, options);
  };

  await t.test("sem autenticação retorna 401", async () => {
    const result = await f.request("/api/ai/vehicle-specs", {
      role: null,
      body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
    });
    assert.equal(result.status, 401);
  });

  await t.test("papel não autorizado (despachante) retorna 403", async () => {
    const result = await f.request("/api/ai/vehicle-specs", {
      role: "despachante",
      body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
    });
    assert.equal(result.status, 403);
  });

  await t.test("marca/modelo ausentes retornam 400", async () => {
    const result = await f.request("/api/ai/vehicle-specs", {
      role: "admin",
      body: { year: 2024 },
    });
    assert.equal(result.status, 400);
  });

  await t.test("admin consegue buscar especificações", async () => {
    const result = await f.request("/api/ai/vehicle-specs", {
      role: "admin",
      body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.motorizacao, "1.0 12V TSI Flex");
  });

  await t.test(
    "resposta traz a versão/trim identificada como texto (visível no campo Versão)",
    async () => {
      const result = await f.request("/api/ai/vehicle-specs", {
        role: "admin",
        body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
      });
      assert.equal(result.status, 200);
      assert.equal(
        result.data.versao_identificada,
        "Sense 1.0 12V TSI Flex Automático",
      );
    },
  );

  await t.test(
    "versão identificada inválida (não string) vira null, não quebra a resposta",
    async () => {
      global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.startsWith(f.url)) return originalFetch(url, options);
        if (target.includes("generativelanguage.googleapis.com")) {
          return geminiJsonResponse({ ...specsPayload, versao_identificada: 123 });
        }
        return originalFetch(url, options);
      };

      const result = await f.request("/api/ai/vehicle-specs", {
        role: "admin",
        body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.versao_identificada, null);

      // restaura o mock padrão para os testes seguintes
      global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.startsWith(f.url)) return originalFetch(url, options);
        if (target.includes("generativelanguage.googleapis.com")) {
          lastGeminiBody = JSON.parse(options.body);
          return geminiJsonResponse(specsPayload);
        }
        return originalFetch(url, options);
      };
    },
  );

  await t.test("vendedor também consegue buscar especificações", async () => {
    const result = await f.request("/api/ai/vehicle-specs", {
      role: "vendedor",
      body: { brand: "Volkswagen", model: "T-Cross", year: 2024 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.confianca, "alta");
  });

  await t.test(
    "cilindrada e potência lidas do CRLV são enviadas como pista para a IA",
    async () => {
      lastGeminiBody = null;

      const result = await f.request("/api/ai/vehicle-specs", {
        role: "admin",
        body: {
          brand: "Volkswagen",
          model: "T-Cross",
          year: 2024,
          engine_displacement_cc: 999,
          horsepower: 128,
        },
      });

      assert.equal(result.status, 200);
      assert.ok(lastGeminiBody, "a IA deveria ter sido chamada");

      const promptText = lastGeminiBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('"cilindrada_conhecida_cc": 999'));
      assert.ok(promptText.includes('"potencia_conhecida_cv": 128'));
    },
  );

  await t.test(
    "cilindrada/potência inválidas ou ausentes viram null (não quebram a busca)",
    async () => {
      lastGeminiBody = null;

      const result = await f.request("/api/ai/vehicle-specs", {
        role: "admin",
        body: {
          brand: "Volkswagen",
          model: "T-Cross",
          year: 2024,
          engine_displacement_cc: "não é um número",
          horsepower: 999999,
        },
      });

      assert.equal(result.status, 200);

      const promptText = lastGeminiBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('"cilindrada_conhecida_cc": null'));
      assert.ok(promptText.includes('"potencia_conhecida_cv": null'));
    },
  );
});
