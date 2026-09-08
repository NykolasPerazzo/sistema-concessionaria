const bcrypt = require("bcryptjs");
const pool = require("../database/connection");

const ALLOWED_ROLES = ["admin", "vendedor", "despachante", "financeiro"];

/*
 * Só leitura, só o essencial para popular seletores (ex.: atribuir
 * vendedor a um lead).
 */
async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, role FROM users WHERE role IN ('admin', 'vendedor', 'despachante') ORDER BY name`,
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("Erro ao listar usuários:", error.code || error.message);

    res.status(500).json({
      error: "Não foi possível carregar os usuários.",
    });
  }
}

// Listagem completa para a tela de gerenciamento (admin only).
async function listAllUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role FROM users ORDER BY name`,
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("Erro ao listar usuários:", error.code || error.message);

    res.status(500).json({
      error: "Não foi possível carregar os usuários.",
    });
  }
}

async function createUser(req, res) {
  try {
    const { name, email, password, role } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof role !== "string"
    ) {
      return res.status(400).json({
        error: "Nome, e-mail, senha e perfil são obrigatórios.",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({
        error: "Nome, e-mail, senha e perfil são obrigatórios.",
      });
    }

    if (normalizedName.length > 120 || normalizedEmail.length > 254) {
      return res.status(400).json({
        error: "Dados inválidos.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: "E-mail inválido.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "A senha precisa ter entre 8 e 128 caracteres.",
      });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        error: "Perfil inválido.",
      });
    }

    const existingUser = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [normalizedEmail],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "Já existe um usuário com esse e-mail.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [normalizedName, normalizedEmail, passwordHash, role],
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error("Erro ao criar usuário:", error.code || error.message);

    res.status(500).json({
      error: "Não foi possível criar o usuário.",
    });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        error: "ID inválido.",
      });
    }

    if (Number(id) === req.user.sub) {
      return res.status(400).json({
        error: "Você não pode excluir seu próprio usuário.",
      });
    }

    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    res.json({ message: "Usuário excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error.code || error.message);

    res.status(500).json({
      error: "Não foi possível excluir o usuário.",
    });
  }
}

module.exports = { listUsers, listAllUsers, createUser, deleteUser };
