// Banco descartável. Não usa o .env nem acessa o PostgreSQL da loja.
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
    CREATE TABLE vehicle_images(id SERIAL PRIMARY KEY, vehicle_id INTEGER, image_url TEXT, is_cover BOOLEAN);`);
  const migration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/001_sales.sql"),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration); // migração repetível
  const proposalMigration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/002_proposals.sql"),
    "utf8",
  );
  await db.exec(proposalMigration);
  await db.exec(proposalMigration);
  const customerMigration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/003_customers.sql"),
    "utf8",
  );
  await db.exec(customerMigration);
  await db.exec(customerMigration);
  const leadMigration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/004_leads.sql"),
    "utf8",
  );
  await db.exec(leadMigration);
  await db.exec(leadMigration);
  const metaAiMigration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/005_meta_lead_ai.sql"),
    "utf8",
  );
  await db.exec(metaAiMigration);
  await db.exec(metaAiMigration);
  const cloudinaryMigration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/006_cloudinary_images.sql"),
    "utf8",
  );
  await db.exec(cloudinaryMigration);
  await db.exec(cloudinaryMigration);
  const leadIntelligenceMigration = fs.readFileSync(
    path.join(
      __dirname,
      "../../database/migrations/007_lead_intelligence.sql",
    ),
    "utf8",
  );
  await db.exec(leadIntelligenceMigration);
  await db.exec(leadIntelligenceMigration);
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
  app.use("/api/proposals", require("../../routes/proposals.routes"));
  app.use("/api/customers", require("../../routes/customers.routes"));
  app.use("/api/leads", require("../../routes/leads.routes"));
  app.use("/api/integrations/meta", require("../../routes/meta.routes"));
  app.use("/api/vehicles", require("../../routes/vehicles.routes"));
  const { authenticate } = require("../../middleware/auth.middleware");
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ user: { id: req.user.sub, role: req.user.role } }),
  );
  app.get("/js/config.js", (req, res) =>
    res.type("js").send('const API_URL = "/api";'),
  );
  app.use(express.static(path.join(__dirname, "../../../frontend")));
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = (role) =>
    require("jsonwebtoken").sign({ sub: 1, role }, process.env.JWT_SECRET);
  async function request(route, { role = "admin", method = "GET", body } = {}) {
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
