require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/007_lead_intelligence.sql"),
        "utf8",
      ),
    );
    console.log("Perfil Inteligente do Lead: banco atualizado com sucesso.");
  } catch (e) {
    console.error("Falha na migração do Perfil Inteligente:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
