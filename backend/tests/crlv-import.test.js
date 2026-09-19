const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  fixture,
  defaultExtractResult,
  PDF_BUFFER,
  JPEG_BUFFER,
  PNG_BUFFER,
} = require("./helpers/crlv-fixture");

const ROUTE = "/api/vehicles/import-crlv";

function providerError(code) {
  return Object.assign(new Error(code), { code });
}

test("importação de CRLV no cadastro de veículos", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  /* ==========================================
     AUTENTICAÇÃO E AUTORIZAÇÃO
  ========================================== */

  await t.test("sem autenticação retorna 401", async () => {
    const result = await f.requestUpload(ROUTE, {
      role: null,
      fileBuffer: PDF_BUFFER,
    });
    assert.equal(result.status, 401);
  });

  await t.test("papel não autorizado (despachante) retorna 403", async () => {
    const result = await f.requestUpload(ROUTE, {
      role: "despachante",
      fileBuffer: PDF_BUFFER,
    });
    assert.equal(result.status, 403);
  });

  await t.test("admin consegue realizar a leitura", async () => {
    const result = await f.requestUpload(ROUTE, {
      role: "admin",
      fileBuffer: PDF_BUFFER,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.success, true);
  });

  await t.test("vendedor consegue realizar a leitura", async () => {
    const result = await f.requestUpload(ROUTE, {
      role: "vendedor",
      fileBuffer: PDF_BUFFER,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.success, true);
  });

  /* ==========================================
     UPLOAD: PRESENÇA, TIPOS E ASSINATURA
  ========================================== */

  await t.test("requisição sem arquivo retorna 400", async () => {
    const result = await f.requestUpload(ROUTE, { omitFile: true });
    assert.equal(result.status, 400);
  });

  await t.test("PDF válido é aceito", async () => {
    const result = await f.requestUpload(ROUTE, {
      fileBuffer: PDF_BUFFER,
      mimeType: "application/pdf",
      fileName: "crlv.pdf",
    });
    assert.equal(result.status, 200);
  });

  await t.test("JPEG válido é aceito", async () => {
    const result = await f.requestUpload(ROUTE, {
      fileBuffer: JPEG_BUFFER,
      mimeType: "image/jpeg",
      fileName: "crlv.jpg",
    });
    assert.equal(result.status, 200);
  });

  await t.test("PNG válido é aceito", async () => {
    const result = await f.requestUpload(ROUTE, {
      fileBuffer: PNG_BUFFER,
      mimeType: "image/png",
      fileName: "crlv.png",
    });
    assert.equal(result.status, 200);
  });

  await t.test(
    "MIME permitido com assinatura real inválida retorna 415",
    async () => {
      // Declara PDF, mas o conteúdo real é de um JPEG.
      const result = await f.requestUpload(ROUTE, {
        fileBuffer: JPEG_BUFFER,
        mimeType: "application/pdf",
        fileName: "fake.pdf",
      });
      assert.equal(result.status, 415);
    },
  );

  await t.test("tipo não permitido retorna 415", async () => {
    const result = await f.requestUpload(ROUTE, {
      fileBuffer: Buffer.from("qualquer coisa"),
      mimeType: "text/plain",
      fileName: "crlv.txt",
    });
    assert.equal(result.status, 415);
  });

  await t.test("arquivo acima de 10 MB retorna 413", async () => {
    const bigBuffer = Buffer.concat([
      PDF_BUFFER,
      Buffer.alloc(11 * 1024 * 1024, 0x41),
    ]);
    const result = await f.requestUpload(ROUTE, {
      fileBuffer: bigBuffer,
      mimeType: "application/pdf",
      fileName: "grande.pdf",
    });
    assert.equal(result.status, 413);
  });

  /* ==========================================
     ERROS DO PROVEDOR DE IA
  ========================================== */

  await t.test("resposta inválida do provedor retorna 502", async () => {
    f.crlvService.extract = async () => {
      throw providerError("PROVIDER_ERROR");
    };
    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 502);
  });

  await t.test("timeout retorna 504", async () => {
    f.crlvService.extract = async () => {
      throw providerError("TIMEOUT");
    };
    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 504);
  });

  await t.test("Gemini não configurado retorna 503", async () => {
    f.crlvService.extract = async () => {
      throw providerError("NOT_CONFIGURED");
    };
    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 503);
  });

  await t.test(
    "provedor indisponível (5xx/429 da IA) também retorna 503",
    async () => {
      f.crlvService.extract = async () => {
        throw providerError("PROVIDER_UNAVAILABLE");
      };
      const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
      assert.equal(result.status, 503);
    },
  );

  await t.test(
    "erro sem código conhecido retorna 500 (não expõe detalhes)",
    async () => {
      f.crlvService.extract = async () => {
        throw new Error("algo interno bem específico");
      };
      const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
      assert.equal(result.status, 500);
      assert.ok(!result.data.error.includes("algo interno bem específico"));
    },
  );

  /* ==========================================
     DOCUMENTO NÃO RECONHECIDO
  ========================================== */

  await t.test("documento não reconhecido retorna 422 e não cria veículo", async () => {
    f.crlvService.extract = async () => ({
      is_crlv: false,
      document_type: "UNKNOWN",
      data: {},
      confidence: {},
      warnings: [],
    });

    const before = await f.pool.query("SELECT COUNT(*)::int AS total FROM vehicles");

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 422);

    const after = await f.pool.query("SELECT COUNT(*)::int AS total FROM vehicles");
    assert.equal(after.rows[0].total, before.rows[0].total);
  });

  /* ==========================================
     SANITIZAÇÃO, NORMALIZAÇÃO E PRIVACIDADE
  ========================================== */

  await t.test("campos ausentes na IA continuam null", async () => {
    f.crlvService.extract = async () => ({
      is_crlv: true,
      document_type: "CRLV",
      data: {
        license_plate: null,
        renavam: null,
        chassis_number: null,
        brand: "FIAT",
        model: "ARGO",
        manufacture_year: null,
        model_year: null,
        color: null,
        fuel: null,
        vehicle_type: null,
        species: null,
        category: null,
        engine_displacement_cc: null,
        horsepower: null,
      },
      confidence: {},
      warnings: [],
    });

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 200);
    assert.equal(result.data.data.license_plate, null);
    assert.equal(result.data.data.renavam, null);
    assert.equal(result.data.data.chassis_number, null);
    assert.equal(result.data.data.color, null);
    assert.equal(result.data.data.fuel, null);
  });

  await t.test(
    "dados são normalizados (placa, RENAVAM, chassi, combustível)",
    async () => {
      f.crlvService.extract = async () => ({
        is_crlv: true,
        document_type: "CRLV_E",
        data: {
          license_plate: "abc-1d23",
          renavam: "123.456.789-01",
          chassis_number: "9bwzzz377vt004251",
          brand: "VOLKSWAGEN",
          model: "T-CROSS",
          manufacture_year: 2023,
          model_year: 2024,
          color: "  Branca  ",
          fuel: "ÁLCOOL/GASOLINA",
          vehicle_type: "AUTOMOVEL",
          species: "PASSAGEIRO",
          category: "PARTICULAR",
          engine_displacement_cc: 999,
          horsepower: 128,
        },
        confidence: {
          license_plate: "alta",
          renavam: "alta",
          chassis_number: "alta",
        },
        warnings: [],
      });

      const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
      assert.equal(result.status, 200);
      assert.equal(result.data.data.license_plate, "ABC1D23");
      assert.equal(result.data.data.renavam, "12345678901");
      assert.equal(result.data.data.chassis_number, "9BWZZZ377VT004251");
      assert.equal(result.data.data.fuel, "Flex");
      assert.equal(result.data.data.color, "Branca");
    },
  );

  await t.test(
    "RENAVAM e chassi fora do padrão ficam marcados para revisão",
    async () => {
      f.crlvService.extract = async () => ({
        is_crlv: true,
        document_type: "CRLV",
        data: {
          ...defaultExtractResult().data,
          renavam: "123", // fora do padrão de 11 dígitos
          chassis_number: "CURTO123", // fora do padrão de 17 caracteres
        },
        confidence: defaultExtractResult().confidence,
        warnings: [],
      });

      const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
      assert.equal(result.status, 200);
      assert.equal(result.data.confidence.renavam, "baixa");
      assert.equal(result.data.confidence.chassis_number, "baixa");
      assert.ok(result.data.warnings.length > 0);
      assert.equal(result.data.needs_review, true);
    },
  );

  await t.test(
    "nome, CPF e endereço eventualmente devolvidos pelo mock são descartados",
    async () => {
      f.crlvService.extract = async () => ({
        is_crlv: true,
        document_type: "CRLV_E",
        data: {
          ...defaultExtractResult().data,
          name: "João da Silva",
          cpf: "123.456.789-00",
          owner_name: "João da Silva",
          address: "Rua das Flores, 123",
        },
        confidence: defaultExtractResult().confidence,
        warnings: [],
      });

      const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
      assert.equal(result.status, 200);

      const keys = Object.keys(result.data.data);
      assert.ok(!keys.includes("name"));
      assert.ok(!keys.includes("cpf"));
      assert.ok(!keys.includes("owner_name"));
      assert.ok(!keys.includes("address"));

      const raw = JSON.stringify(result.data);
      assert.ok(!raw.includes("João da Silva"));
      assert.ok(!raw.includes("123.456.789-00"));
      assert.ok(!raw.includes("Rua das Flores"));
    },
  );

  /* ==========================================
     DUPLICIDADE
  ========================================== */

  await t.test("duplicidade de placa é informada", async () => {
    await f.pool.query(
      `INSERT INTO vehicles(brand, model, year, price, status, license_plate)
       VALUES ('Chevrolet', 'Onix', 2022, 80000, 'available', 'ABC1D23')`,
    );

    f.crlvService.extract = async () => ({
      ...defaultExtractResult(),
      data: {
        ...defaultExtractResult().data,
        renavam: null,
        chassis_number: null,
      },
    });

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 200);
    assert.equal(result.data.duplicates.length, 1);
    assert.equal(result.data.duplicates[0].field, "license_plate");
    assert.equal(result.data.needs_review, true);
  });

  await t.test("duplicidade de RENAVAM é informada", async () => {
    await f.pool.query(
      `INSERT INTO vehicles(brand, model, year, price, status, renavam)
       VALUES ('Toyota', 'Corolla', 2021, 120000, 'available', '98765432100')`,
    );

    f.crlvService.extract = async () => ({
      ...defaultExtractResult(),
      data: {
        ...defaultExtractResult().data,
        license_plate: null,
        renavam: "98765432100",
        chassis_number: null,
      },
    });

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 200);
    const renavamDuplicate = result.data.duplicates.find(
      (d) => d.field === "renavam",
    );
    assert.ok(renavamDuplicate);
  });

  await t.test("duplicidade de chassi é informada", async () => {
    await f.pool.query(
      `INSERT INTO vehicles(brand, model, year, price, status, chassis_number)
       VALUES ('Honda', 'Civic', 2020, 100000, 'available', 'JHMEJ6674MS000001')`,
    );

    f.crlvService.extract = async () => ({
      ...defaultExtractResult(),
      data: {
        ...defaultExtractResult().data,
        license_plate: null,
        renavam: null,
        chassis_number: "JHMEJ6674MS000001",
      },
    });

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 200);
    const chassisDuplicate = result.data.duplicates.find(
      (d) => d.field === "chassis_number",
    );
    assert.ok(chassisDuplicate);
  });

  await t.test("sem duplicidade, a lista vem vazia", async () => {
    f.crlvService.extract = async () => ({
      ...defaultExtractResult(),
      data: {
        ...defaultExtractResult().data,
        license_plate: "XYZ9Z99",
        renavam: "11122233344",
        chassis_number: "1HGCM82633A004352",
      },
    });

    const result = await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.duplicates, []);
  });

  /* ==========================================
     LEITURA NÃO CRIA VEÍCULO
  ========================================== */

  await t.test("a leitura nunca insere linha em vehicles", async () => {
    f.crlvService.extract = async () => defaultExtractResult();

    const before = await f.pool.query(
      "SELECT COUNT(*)::int AS total FROM vehicles",
    );

    await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER, role: "admin" });
    await f.requestUpload(ROUTE, { fileBuffer: PDF_BUFFER, role: "vendedor" });

    const after = await f.pool.query(
      "SELECT COUNT(*)::int AS total FROM vehicles",
    );
    assert.equal(after.rows[0].total, before.rows[0].total);
  });

  /* ==========================================
     PERMISSÕES DO VENDEDOR NO CADASTRO
     (POST /api/vehicles)
  ========================================== */

  const baseVehicle = {
    brand: "Fiat",
    model: "Argo",
    year: 2023,
    price: 90000,
  };

  await t.test("vendedor pode criar veículo operacional", async () => {
    const result = await f.request("/api/vehicles", {
      role: "vendedor",
      method: "POST",
      body: { ...baseVehicle, mileage: 10000, fuel: "Flex" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.vehicle.status, "available");
  });

  await t.test("vendedor não pode enviar purchase_price", async () => {
    const result = await f.request("/api/vehicles", {
      role: "vendedor",
      method: "POST",
      body: { ...baseVehicle, purchase_price: 70000 },
    });
    assert.equal(result.status, 403);
  });

  await t.test("vendedor não pode enviar sale_price", async () => {
    const result = await f.request("/api/vehicles", {
      role: "vendedor",
      method: "POST",
      body: { ...baseVehicle, sale_price: 95000 },
    });
    assert.equal(result.status, 403);
  });

  await t.test(
    "vendedor não consegue cadastrar veículo como vendido",
    async () => {
      const result = await f.request("/api/vehicles", {
        role: "vendedor",
        method: "POST",
        body: { ...baseVehicle, status: "sold" },
      });
      assert.equal(result.status, 201);
      assert.equal(
        result.data.vehicle.status,
        "available",
        "status enviado pelo vendedor deve ser sempre forçado para available",
      );
    },
  );

  await t.test(
    "admin mantém o fluxo atual (campos financeiros e status)",
    async () => {
      const result = await f.request("/api/vehicles", {
        role: "admin",
        method: "POST",
        body: {
          ...baseVehicle,
          purchase_price: 70000,
          sale_price: 95000,
          status: "reserved",
        },
      });
      assert.equal(result.status, 201);
      assert.equal(Number(result.data.vehicle.purchase_price), 70000);
      assert.equal(result.data.vehicle.status, "reserved");
    },
  );

  /* ==========================================
     ÍNDICE ÚNICO (23505 → 409)
  ========================================== */

  await t.test("violação de índice único (placa) retorna 409", async () => {
    const first = await f.request("/api/vehicles", {
      role: "admin",
      method: "POST",
      body: {
        brand: "Jeep",
        model: "Compass",
        year: 2024,
        price: 150000,
        license_plate: "DUP1A23",
      },
    });
    assert.equal(first.status, 201);

    const second = await f.request("/api/vehicles", {
      role: "admin",
      method: "POST",
      body: {
        brand: "Jeep",
        model: "Renegade",
        year: 2024,
        price: 140000,
        license_plate: "DUP1A23",
      },
    });
    assert.equal(second.status, 409);
  });
});
