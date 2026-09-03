require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/005_meta_lead_ai.sql"),
        "utf8",
      ),
    );
    console.log("Meta Lead Ads e IA: banco atualizado com sucesso.");
  } catch (e) {
    console.error("Falha na migração Meta/IA:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
