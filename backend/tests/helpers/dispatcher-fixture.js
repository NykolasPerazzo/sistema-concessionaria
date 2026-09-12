// Banco descartável. Não usa o .env nem acessa o PostgreSQL da loja.
// Mesmo formato de sales-fixture.js, com a migration do despachante aplicada
// por cima e a rota /api/dispatcher montada.
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY, brand TEXT, model TEXT, year INTEGER, price NUMERIC(14,2),
    purchase_price NUMERIC(14,2), entry_date DATE, sale_price NUMERIC(14,2),
    status TEXT, image_url TEXT, mileage INTEGER, fuel TEXT, transmission TEXT,
    body_type TEXT, color TEXT, description TEXT);
    CREATE TABLE vehicle_expenses(id SERIAL PRIMARY KEY, vehicle_id INTEGER REFERENCES vehicles(id), amount NUMERIC(14,2));
    CREATE TABLE vehicle_images(id SERIAL PRIMARY KEY, vehicle_id INTEGER, image_url TEXT, is_cover BOOLEAN);
    CREATE TABLE users(id SERIAL PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, role TEXT);
    INSERT INTO users(id, name, email, password_hash, role) VALUES
      (1, 'Admin Teste', 'admin@example.com', 'x', 'admin'),
      (2, 'Vendedor Teste', 'vendedor@example.com', 'x', 'vendedor'),
      (3, 'Despachante Teste', 'despachante@example.com', 'x', 'despachante'),
      (4, 'Financeiro Teste', 'financeiro@example.com', 'x', 'financeiro');
    SELECT setval('users_id_seq', 4);`);
  const migrations = [
    "001_sales.sql",
    "002_proposals.sql",
    "003_customers.sql",
    "004_leads.sql",
    "005_meta_lead_ai.sql",
    "006_cloudinary_images.sql",
    "007_lead_intelligence.sql",
    "008_lead_ai_history.sql",
    "009_lead_assignment.sql",
    "010_dispatcher.sql",
    "011_vehicle_specs.sql",
    "012_sales_seller.sql",
  ];
  for (const file of migrations) {
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
  const connection = require.resolve("../../database/connection");
  require.cache[connection] = {
    id: connection,
    filename: connection,
    loaded: true,
    exports: pool,
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
  app.use("/api/sales", require("../../routes/sales.routes"));
  app.use("/api/customers", require("../../routes/customers.routes"));
  app.use("/api/vehicles", require("../../routes/vehicles.routes"));
  app.use("/api/dispatcher", require("../../routes/dispatcher.routes"));
  const { authenticate } = require("../../middleware/auth.middleware");
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ user: { id: req.user.sub, role: req.user.role } }),
  );
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = (role, userId = 1) =>
    require("jsonwebtoken").sign(
      { sub: userId, role },
      process.env.JWT_SECRET,
    );
  async function request(
    route,
    { role = "admin", userId = 1, method = "GET", body } = {},
  ) {
    const headers = { "Content-Type": "application/json" };
    if (role) headers.Cookie = `token=${token(role, userId)}`;
    const response = await fetch(url + route, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
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
    async close() {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}
module.exports = { fixture };
