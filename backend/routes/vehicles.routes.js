const express = require("express");

const upload =
    require("../middleware/upload.middleware");

const router = express.Router();

const {
    getVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
} = require("../controllers/vehicles.controller");


router.get(
    "/",
    getVehicles
);


router.get(
    "/:id",
    getVehicleById
);


router.post(
    "/",
    upload.fields([
        {
            name: "coverImage",
            maxCount: 1
        },
        {
            name: "galleryImages",
            maxCount: 10
        }
    ]),
    createVehicle
);


router.put(
    "/:id",
    upload.fields([
        {
            name: "coverImage",
            maxCount: 1
        },
        {
            name: "galleryImages",
            maxCount: 10
        }
    ]),
    updateVehicle
);


router.delete(
    "/:id",
    deleteVehicle
);


module.exports = router;