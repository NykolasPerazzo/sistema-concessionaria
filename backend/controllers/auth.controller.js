const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../database/connection");

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "E-mail e senha são obrigatórios."
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password_hash, role
             FROM users
             WHERE email = $1`,
            [email.toLowerCase().trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: "E-mail ou senha inválidos."
            });
        }

        const user = result.rows[0];

        const passwordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordValid) {
            return res.status(401).json({
                error: "E-mail ou senha inválidos."
            });
        }

        const token = jwt.sign(
            {
                sub: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
            maxAge: 8 * 60 * 60 * 1000
        });

        res.json({
            message: "Login realizado com sucesso.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Erro no login:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const logout = (req, res) => {
    res.clearCookie("token");

    res.json({
        message: "Logout realizado com sucesso."
    });
};

const me = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role
             FROM users
             WHERE id = $1`,
            [req.user.sub]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Usuário não encontrado."
            });
        }

        res.json({
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Erro ao buscar usuário:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

module.exports = {
    login,
    logout,
    me
};