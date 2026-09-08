require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/010_dispatcher.sql"),
        "utf8",
      ),
    );
    console.log("Área de despachante: banco atualizado com sucesso.");
  } catch (error) {
    console.error("Falha na migração de despachante:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
