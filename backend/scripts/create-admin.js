require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../database/connection");

const createAdmin = async () => {
    const name = "Admin";
    const email = "admin@car-dealer.com";
    const password = "53984";

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users
                (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, role`,
            [
                name,
                email,
                passwordHash,
                "admin"
            ]
        );

        console.log("Administrador criado:");
        console.log(result.rows[0]);

    } catch (error) {
        console.error("Erro:", error);
    } finally {
        await pool.end();
    }
};

createAdmin();