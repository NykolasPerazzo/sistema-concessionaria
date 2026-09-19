// Banco descartável. Não usa o .env nem acessa o PostgreSQL da loja, e
// nunca chama a API real do Gemini (o serviço de extração é substituído
// por um mock injetável via require.cache, o mesmo truque usado para o
// pool de conexão nas outras fixtures deste projeto).
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");

async function fixture() {
  const db = new PGlite();

  // license_plate/renavam/chassis_number já existem aqui (normalmente
  // vêm da migração 013_documents.sql) porque essa migração também cria
  // a tabela "documents", com FKs para "customers"/"sales" que não
  // interessam a estes testes. As migrações 011 e 014 (só ALTER TABLE
  // vehicles) rodam de verdade abaixo, validando o SQL real.
  await db.exec(`CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY, brand TEXT, model TEXT, year INTEGER, price NUMERIC(14,2),
    purchase_price NUMERIC(14,2), entry_date DATE, sale_price NUMERIC(14,2),
    status TEXT, image_url TEXT, mileage INTEGER, fuel TEXT, transmission TEXT,
    body_type TEXT, color TEXT, description TEXT,
    license_plate VARCHAR(10), renavam VARCHAR(20), chassis_number VARCHAR(30));
    CREATE TABLE vehicle_images(id SERIAL PRIMARY KEY, vehicle_id INTEGER, image_url TEXT, public_id TEXT, is_cover BOOLEAN);
    CREATE TABLE sales(id SERIAL PRIMARY KEY, vehicle_id INTEGER, cancelled_at TIMESTAMPTZ);
    CREATE TABLE users(id SERIAL PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, role TEXT);
    INSERT INTO users(id, name, email, password_hash, role) VALUES
      (1, 'Admin Teste', 'admin@example.com', 'x', 'admin'),
      (2, 'Vendedor Teste', 'vendedor@example.com', 'x', 'vendedor');
    SELECT setval('users_id_seq', 2);`);

  for (const file of ["011_vehicle_specs.sql", "014_crlv_import.sql"]) {
    const sql = fs.readFileSync(
      path.join(__dirname, "../../database/migrations", file),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql); // migração repetível
  }

  // PGlite possui uma conexão. A fila impede intercalar transações HTTP no teste.
  let queue = Promise.resolve();
  async function acquire() {
    let unlock;
    const gate = new Promise((r) => (unlock = r));
    const previous = queue;
    queue = queue.then(() => gate);
    await previous;
    return unlock;
  }
  const pool = {
    async query(sql, args) {
      const release = await acquire();
      try {
        return await db.query(sql, args);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await acquire();
      return { query: (sql, args) => db.query(sql, args), release };
    },
  };

  const connectionPath = require.resolve("../../database/connection");
  require.cache[connectionPath] = {
    id: connectionPath,
    filename: connectionPath,
    loaded: true,
    exports: pool,
  };

  // Substitui a chamada real ao Gemini por um mock controlável pelo
  // teste. O sanitizador/normalizador reais continuam em uso — só a
  // "chamada à IA" (extract) é falsa.
  const crlvServicePath = require.resolve(
    "../../services/crlv-extraction.service",
  );
  const crlvService = {
    extract: async () => defaultExtractResult(),
    configured: () => true,
  };
  require.cache[crlvServicePath] = {
    id: crlvServicePath,
    filename: crlvServicePath,
    loaded: true,
    exports: crlvService,
  };

  process.env.JWT_SECRET = "isolated-test-secret-not-for-production";

  const express = require("express");
  const app = express();
  app.use(
    express.json({
      verify: (req, res, buffer) => {
        req.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(require("cookie-parser")());
  app.use("/api/vehicles", require("../../routes/vehicles.routes"));

  const { authenticate } = require("../../middleware/auth.middleware");
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ user: { id: req.user.sub, role: req.user.role } }),
  );

  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  // Cada chamada usa, por padrão, um "sub" novo — evita que os testes
  // acumulem no mesmo contador do rate limit de leitura de CRLV
  // (10 leituras/15min por usuário), que é por processo e persiste
  // durante toda a execução deste arquivo de teste.
  let subCounter = 1000;
  const token = (role, sub) =>
    require("jsonwebtoken").sign(
      { sub: sub ?? subCounter++, role },
      process.env.JWT_SECRET,
    );

  async function request(
    route,
    { role = "admin", sub, method = "GET", body } = {},
  ) {
    const headers = { "Content-Type": "application/json" };
    if (role) headers.Cookie = `token=${token(role, sub)}`;
    const response = await fetch(url + route, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  async function requestUpload(
    route,
    {
      role = "admin",
      sub,
      method = "POST",
      fileBuffer,
      fileName = "crlv.pdf",
      mimeType = "application/pdf",
      fieldName = "crlv",
      omitFile = false,
    } = {},
  ) {
    const headers = {};
    if (role) headers.Cookie = `token=${token(role, sub)}`;

    const formData = new FormData();
    if (!omitFile && fileBuffer) {
      formData.append(
        fieldName,
        new Blob([fileBuffer], { type: mimeType }),
        fileName,
      );
    }

    const response = await fetch(url + route, {
      method,
      headers,
      body: formData,
    });
    return { status: response.status, data: await response.json() };
  }

  return {
    db,
    pool,
    server,
    url,
    token,
    request,
    requestUpload,
    crlvService,
    async close() {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}

/* ==========================================
   RESULTADO PADRÃO DO MOCK DE EXTRAÇÃO
   (formato "bruto", como se tivesse vindo do
   Gemini — passa pelo sanitizador/normalizador
   reais no controller)
========================================== */

function defaultExtractResult() {
  return {
    is_crlv: true,
    document_type: "CRLV_E",
    data: {
      license_plate: "ABC1D23",
      renavam: "12345678901",
      chassis_number: "9BWZZZ377VT004251",
      brand: "VOLKSWAGEN",
      model: "T-CROSS",
      manufacture_year: 2023,
      model_year: 2024,
      color: "BRANCA",
      fuel: "FLEX",
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
      brand: "media",
      model: "media",
      manufacture_year: "alta",
      model_year: "alta",
      color: "alta",
      fuel: "alta",
      vehicle_type: "media",
      species: "media",
      category: "media",
      engine_displacement_cc: "baixa",
      horsepower: "baixa",
    },
    warnings: [],
  };
}

// Assinaturas mínimas válidas, usadas para passar pela verificação de
// conteúdo real do arquivo (crlv-upload.middleware.js), sem precisar de
// um CRLV verdadeiro.
const PDF_BUFFER = Buffer.from("%PDF-1.4\n%mock-pdf-for-tests\n");

const JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]);

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
]);

module.exports = {
  fixture,
  defaultExtractResult,
  PDF_BUFFER,
  JPEG_BUFFER,
  PNG_BUFFER,
};
