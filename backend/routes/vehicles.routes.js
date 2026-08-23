const express = require("express");

const router = express.Router();

const {
    createVehicle
} = require("../controllers/vehicles.controller");

router.get("/", (req, res) => {
    res.json({
        message: "Rota de veículos funcionando!",
        vehicles: []
    });
});

router.post("/", createVehicle);

module.exports = router;