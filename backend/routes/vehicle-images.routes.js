const express = require("express");

const router = express.Router();

const {
    getVehicleImages,
    createVehicleImage,
    deleteVehicleImage
} = require("../controllers/vehicle-images.controller");

router.get("/:vehicleId", getVehicleImages);

router.post("/:vehicleId", createVehicleImage);

router.delete("/:imageId", deleteVehicleImage);

module.exports = router;