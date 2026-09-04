const express = require("express");

const upload = require("../middleware/upload.middleware");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} = require("../controllers/vehicles.controller");

router.get("/", getVehicles);

router.get("/:id", getVehicleById);

router.post(
  "/",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    {
      name: "coverImage",
      maxCount: 1,
    },
    {
      name: "galleryImages",
      maxCount: 10,
    },
  ]),
  createVehicle,
);

router.put(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    {
      name: "coverImage",
      maxCount: 1,
    },
    {
      name: "galleryImages",
      maxCount: 10,
    },
  ]),
  updateVehicle,
);

router.delete("/:id", authenticate, authorizeRoles("admin"), deleteVehicle);

module.exports = router;
