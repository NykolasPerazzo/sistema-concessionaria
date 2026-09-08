require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/008_lead_ai_history.sql"),
        "utf8",
      ),
    );
    console.log("Histórico de análises de IA: banco atualizado com sucesso.");
  } catch (e) {
    console.error("Falha na migração do histórico de IA:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
