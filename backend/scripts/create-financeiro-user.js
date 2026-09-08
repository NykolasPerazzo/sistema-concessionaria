require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../database/connection");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

const createFinanceiroUser = async () => {
  try {
    console.log("\n=== Criar usuário financeiro ===\n");

    const name = (await ask("Nome: ")).trim();
    const email = (await ask("E-mail: ")).trim().toLowerCase();
    const password = await ask("Senha: ");

    if (!name || !email || !password) {
      console.log("\nNome, e-mail e senha são obrigatórios.");
      return;
    }

    if (password.length < 8) {
      console.log("\nA senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    const existingUser = await pool.query(
      `
            SELECT id
            FROM users
            WHERE email = $1
            `,
      [email],
    );

    if (existingUser.rows.length > 0) {
      console.log("\nJá existe um usuário com esse e-mail.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
            INSERT INTO users
                (name, email, password_hash, role)
            VALUES
                ($1, $2, $3, $4)
            RETURNING
                id,
                name,
                email,
                role
            `,
      [name, email, passwordHash, "financeiro"],
    );

    console.log("\nUsuário financeiro criado com sucesso:");
    console.table(result.rows);
  } catch (error) {
    console.error("\nErro ao criar usuário financeiro:");
    console.error(error.message);
  } finally {
    rl.close();
    await pool.end();
  }
};

createFinanceiroUser();
