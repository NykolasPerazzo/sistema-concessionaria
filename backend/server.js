const express = require("express");
require("dotenv").config();

const vehiclesRoutes = require("./routes/vehicles.routes");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Car Dealer IA API funcionando!"
    });
});

app.use("/api/vehicles", vehiclesRoutes);

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});


