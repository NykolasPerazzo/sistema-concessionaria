require("dotenv").config();

const express = require("express");
const pool = require("./database/connection");
const vehiclesRoutes = require("./routes/vehicles.routes");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Car Dealer IA API funcionando!"
    });
});

pool.query("SELECT NOW()", (error, result) => {
    if (error) {
        console.error("Erro ao conectar ao PostgreSQL:", error);
    } else {
        console.log("PostgreSQL conectado!");
        console.log("Horário do banco:", result.rows[0].now);
    }
});

app.use("/api/vehicles", vehiclesRoutes);

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});


