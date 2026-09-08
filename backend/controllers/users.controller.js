const pool = require("../database/connection");

/*
 * Só leitura, só o essencial para popular seletores (ex.: atribuir
 * vendedor a um lead). Criar/editar/excluir usuário continua sendo
 * feito pelos scripts backend/scripts/create-admin.js e create-seller.js.
 */
async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, role FROM users WHERE role IN ('admin', 'vendedor') ORDER BY name`,
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("Erro ao listar usuários:", error.code || error.message);

    res.status(500).json({
      error: "Não foi possível carregar os usuários.",
    });
  }
}

module.exports = { listUsers };
