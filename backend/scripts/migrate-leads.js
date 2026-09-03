require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/004_leads.sql"),
        "utf8",
      ),
    );
    console.log("Área de leads: banco atualizado com sucesso.");
  } catch (error) {
    console.error("Falha na migração de leads:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
