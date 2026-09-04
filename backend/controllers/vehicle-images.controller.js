const pool = require("../database/connection");
const cloudinaryService = require("../services/cloudinary.service");

const getVehicleImages = async (req, res) => {
    try {
        const vehicleId = Number(req.params.vehicleId);

        const result = await pool.query(
            `SELECT *
             FROM vehicle_images
             WHERE vehicle_id = $1
             ORDER BY is_cover DESC, id ASC`,
            [vehicleId]
        );

        res.json({
            images: result.rows
        });

    } catch (error) {
        console.error("Erro ao buscar imagens:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const createVehicleImage = async (req, res) => {
    try {
        const vehicleId = Number(req.params.vehicleId);
        const { image_url, is_cover } = req.body;

        if (!image_url) {
            return res.status(400).json({
                error: "image_url é obrigatório."
            });
        }

        const vehicle = await pool.query(
            "SELECT id FROM vehicles WHERE id = $1",
            [vehicleId]
        );

        if (vehicle.rows.length === 0) {
            return res.status(404).json({
                error: "Veículo não encontrado."
            });
        }

        const result = await pool.query(
            `INSERT INTO vehicle_images
                (vehicle_id, image_url, is_cover)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [
                vehicleId,
                image_url,
                is_cover || false
            ]
        );

        res.status(201).json({
            message: "Imagem adicionada com sucesso!",
            image: result.rows[0]
        });

    } catch (error) {
        console.error("Erro ao adicionar imagem:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const deleteVehicleImage = async (req, res) => {
    try {
        const imageId = Number(req.params.imageId);

        const result = await pool.query(
            `DELETE FROM vehicle_images
             WHERE id = $1
             RETURNING *`,
            [imageId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Imagem não encontrada."
            });
        }

        const deletedImage = result.rows[0];

        /*
          Remove o arquivo no Cloudinary (best-effort —
          falha aqui não desfaz a exclusão já
          confirmada no banco). Imagens antigas locais
          não têm public_id, então são ignoradas aqui.
        */
        if (deletedImage.public_id) {
            cloudinaryService
                .deleteAsset(deletedImage.public_id)
                .catch(() => {});
        }

        res.json({
            message: "Imagem excluída com sucesso!",
            image: deletedImage
        });

    } catch (error) {
        console.error("Erro ao excluir imagem:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

module.exports = {
    getVehicleImages,
    createVehicleImage,
    deleteVehicleImage
};