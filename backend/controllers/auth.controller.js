const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../database/connection");

// ==========================================
// CONFIGURAÇÃO DO COOKIE
// ==========================================

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    // "none" é necessário quando frontend e backend ficam em domínios
    // diferentes (ex.: Vercel + Render); exige secure=true, por isso só
    // em produção. Em desenvolvimento local (sem HTTPS) mantém "lax".
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
};

// ==========================================
// LOGIN
// ==========================================

const login = async (req, res) => {
  try {
    // Evita erro caso req.body não exista
    const { email, password } = req.body || {};

    // ======================================
    // VALIDAÇÃO DOS TIPOS
    // ======================================

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "E-mail e senha são obrigatórios.",
      });
    }

    // ======================================
    // NORMALIZAÇÃO
    // ======================================

    const normalizedEmail = email.trim().toLowerCase();

    const normalizedPassword = password;

    // ======================================
    // CAMPOS VAZIOS
    // ======================================

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({
        error: "E-mail e senha são obrigatórios.",
      });
    }

    // ======================================
    // LIMITES DE TAMANHO
    // ======================================

    if (normalizedEmail.length > 254 || normalizedPassword.length > 128) {
      return res.status(400).json({
        error: "Dados de login inválidos.",
      });
    }

    // ======================================
    // FORMATO BÁSICO DO E-MAIL
    // ======================================

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: "E-mail inválido.",
      });
    }

    // ======================================
    // BUSCAR USUÁRIO
    // ======================================

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        password_hash,
        role
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail],
    );

    // ======================================
    // USUÁRIO NÃO ENCONTRADO
    // ======================================

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    const user = result.rows[0];

    // ======================================
    // VALIDAR SENHA
    // ======================================

    const passwordValid = await bcrypt.compare(
      normalizedPassword,
      user.password_hash,
    );

    if (!passwordValid) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    // ======================================
    // VALIDAR ROLE
    // ======================================

    const allowedRoles = ["admin", "vendedor", "despachante", "financeiro"];

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: "Usuário sem permissão de acesso.",
      });
    }

    // ======================================
    // GERAR JWT
    // ======================================

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET não configurado.");

      return res.status(500).json({
        error: "Erro interno do servidor.",
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      },
    );

    // ======================================
    // COOKIE
    // ======================================

    res.cookie("token", token, getCookieOptions());

    // ======================================
    // RESPOSTA
    // ======================================

    return res.status(200).json({
      message: "Login realizado com sucesso.",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

// ==========================================
// LOGOUT
// ==========================================

const logout = (req, res) => {
  const cookieOptions = getCookieOptions();

  res.clearCookie("token", {
    httpOnly: cookieOptions.httpOnly,

    secure: cookieOptions.secure,

    sameSite: cookieOptions.sameSite,

    path: cookieOptions.path,
  });

  return res.status(200).json({
    message: "Logout realizado com sucesso.",
  });
};

// ==========================================
// USUÁRIO LOGADO
// ==========================================

const me = async (req, res) => {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        error: "Não autenticado.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE id = $1
      `,
      [req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  login,
  logout,
  me,
};
