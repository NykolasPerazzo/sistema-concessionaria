require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pool = require("./database/connection");
const vehiclesRoutes = require("./routes/vehicles.routes");
const vehicleImagesRoutes = require("./routes/vehicle-images.routes");
const authRoutes = require("./routes/auth.routes");
const app = express();
const path = require("path");
const PORT = process.env.PORT || 3000;
const allowedOrigins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://192.168.2.102:5500"
];

app.use(cors({
    origin: function (origin, callback) {

        // Permite requisições sem Origin, como algumas ferramentas locais
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origem não permitida pelo CORS."));
    },
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/api/vehicle-images", vehicleImagesRoutes);
app.use("/api/auth", authRoutes);

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

app.use(
    "/uploads",
    express.static(
        path.join(
            __dirname,
            "uploads"
        )
    )
);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});


