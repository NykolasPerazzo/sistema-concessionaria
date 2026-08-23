const pool = require("../database/connection");

const getVehicles = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM vehicles ORDER BY id DESC"
        );

        res.json({
            message: "Veículos encontrados com sucesso!",
            vehicles: result.rows
        });
    } catch (error) {
        console.error("Erro ao buscar veículos:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const getVehicleById = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const result = await pool.query(
            "SELECT * FROM vehicles WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Veículo não encontrado."
            });
        }

        res.json({
            message: "Veículo encontrado com sucesso!",
            vehicle: result.rows[0]
        });
    } catch (error) {
        console.error("Erro ao buscar veículo:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const createVehicle = async (req, res) => {
    try {
        const { brand, model, year, price } = req.body;

        if (!brand || !model || !year || !price) {
            return res.status(400).json({
                error: "Todos os campos são obrigatórios."
            });
        }

        const result = await pool.query(
            `INSERT INTO vehicles (brand, model, year, price)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [brand, model, year, price]
        );

        res.status(201).json({
            message: "Veículo cadastrado com sucesso!",
            vehicle: result.rows[0]
        });
    } catch (error) {
        console.error("Erro ao cadastrar veículo:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const updateVehicle = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const { brand, model, year, price } = req.body;

        if (!brand || !model || !year || !price) {
            return res.status(400).json({
                error: "Todos os campos são obrigatórios."
            });
        }

        const result = await pool.query(
            `UPDATE vehicles
             SET brand = $1,
                 model = $2,
                 year = $3,
                 price = $4
             WHERE id = $5
             RETURNING *`,
            [brand, model, year, price, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Veículo não encontrado."
            });
        }

        res.json({
            message: "Veículo atualizado com sucesso!",
            vehicle: result.rows[0]
        });
    } catch (error) {
        console.error("Erro ao atualizar veículo:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

const deleteVehicle = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const result = await pool.query(
            "DELETE FROM vehicles WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Veículo não encontrado."
            });
        }

        res.json({
            message: "Veículo excluído com sucesso!",
            vehicle: result.rows[0]
        });
    } catch (error) {
        console.error("Erro ao excluir veículo:", error);

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
};

module.exports = {
    getVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
};