require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
(async () => {
  try {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, "../database/migrations/012_sales_seller.sql"),
        "utf8",
      ),
    );
    console.log("Vendedor responsável pela venda: banco atualizado com sucesso.");
  } catch (error) {
    console.error("Falha na migração do vendedor responsável:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
