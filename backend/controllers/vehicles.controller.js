const createVehicle = (req, res) => {
    const { brand, model, year, price } = req.body;

    if (!brand || !model || !year || !price) {
        return res.status(400).json({
            error: "Todos os campos são obrigatórios."
        });
    }

    const vehicle = {
        id: Date.now(),
        brand,
        model,
        year,
        price
    };

    res.status(201).json({
        message: "Veículo cadastrado com sucesso!",
        vehicle
    });
};

module.exports = {
    createVehicle
};