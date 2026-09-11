require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const pool = require("../database/connection");

const createAdmin = async () => {
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const name = (await input.question("Nome: ")).trim();
    const email = (await input.question("E-mail: ")).trim().toLowerCase();
    const password = await input.question("Senha: ");

    if (!name || !email || password.length < 8 || password.length > 128) {
      throw new Error(
        "Informe nome, e-mail e uma senha de 8 a 128 caracteres.",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
                (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, role`,
      [name, email, passwordHash, "admin"],
    );

    console.log("Administrador criado:");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("Não foi possível criar o administrador:", error.message);
  } finally {
    input.close();
    await pool.end();
  }
};

createAdmin();
