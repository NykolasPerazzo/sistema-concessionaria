require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/009_lead_assignment.sql"),
        "utf8",
      ),
    );
    console.log("Atribuição de vendedor: banco atualizado com sucesso.");
  } catch (e) {
    console.error("Falha na migração de atribuição de vendedor:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
