const pool = require("../database/connection");


/* ==========================================
   AUXILIARES
========================================== */

function buildImageUrl(req, filename) {
    if (!filename) {
        return null;
    }

    return `${req.protocol}://${req.get("host")}/uploads/vehicles/${filename}`;
}


function nullable(value) {
    return value === undefined ||
           value === null ||
           value === ""
        ? null
        : value;
}


/* ==========================================
   LISTAR VEÍCULOS
========================================== */

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

        console.error(
            "Erro ao buscar veículos:",
            error
        );

        res.status(500).json({
            error: "Erro interno do servidor."
        });

    }

};


/* ==========================================
   BUSCAR VEÍCULO POR ID
========================================== */

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

        console.error(
            "Erro ao buscar veículo:",
            error
        );

        res.status(500).json({
            error: "Erro interno do servidor."
        });

    }

};


/* ==========================================
   CRIAR VEÍCULO
========================================== */

const createVehicle = async (req, res) => {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const {
            brand,
            model,
            year,
            price,
            mileage,
            fuel,
            transmission,
            body_type,
            color,
            description,
            status
        } = req.body;


        if (!brand || !model || !year || !price) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                error:
                    "Marca, modelo, ano e preço são obrigatórios."
            });

        }


        /* ==============================
           IMAGEM PRINCIPAL
        ============================== */

        const coverFile =
            req.files?.coverImage?.[0];

        const imageUrl =
            coverFile
                ? buildImageUrl(
                    req,
                    coverFile.filename
                )
                : null;


        /* ==============================
           CRIAR VEÍCULO
        ============================== */

        const result = await client.query(
            `
            INSERT INTO vehicles (
                brand,
                model,
                year,
                price,
                mileage,
                fuel,
                transmission,
                body_type,
                color,
                description,
                status,
                image_url
            )
            VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, $10, $11, $12
            )
            RETURNING *
            `,
            [
                brand,
                model,
                Number(year),
                Number(price),
                nullable(mileage),
                nullable(fuel),
                nullable(transmission),
                nullable(body_type),
                nullable(color),
                nullable(description),
                status || "available",
                imageUrl
            ]
        );


        const vehicle =
            result.rows[0];


        /* ==============================
           GALERIA
        ============================== */

        const galleryFiles =
            req.files?.galleryImages || [];


        for (const file of galleryFiles) {

            const galleryImageUrl =
                buildImageUrl(
                    req,
                    file.filename
                );


            await client.query(
                `
                INSERT INTO vehicle_images (
                    vehicle_id,
                    image_url,
                    is_cover
                )
                VALUES ($1, $2, $3)
                `,
                [
                    vehicle.id,
                    galleryImageUrl,
                    false
                ]
            );

        }


        await client.query("COMMIT");


        res.status(201).json({
            message:
                "Veículo cadastrado com sucesso!",
            vehicle
        });


    } catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Erro ao cadastrar veículo:",
            error
        );


        res.status(500).json({
            error:
                "Erro interno do servidor."
        });

    } finally {

        client.release();

    }

};


/* ==========================================
   ATUALIZAR VEÍCULO
========================================== */

const updateVehicle = async (req, res) => {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const id =
            Number(req.params.id);


        const {
            brand,
            model,
            year,
            price,
            mileage,
            fuel,
            transmission,
            body_type,
            color,
            description,
            status
        } = req.body;


        if (!brand || !model || !year || !price) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                error:
                    "Marca, modelo, ano e preço são obrigatórios."
            });

        }


        /* ==============================
           VERIFICAR VEÍCULO
        ============================== */

        const currentVehicleResult =
            await client.query(
                `
                SELECT *
                FROM vehicles
                WHERE id = $1
                `,
                [id]
            );


        if (
            currentVehicleResult.rows.length === 0
        ) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                error:
                    "Veículo não encontrado."
            });

        }


        const currentVehicle =
            currentVehicleResult.rows[0];


        /* ==============================
           NOVA IMAGEM PRINCIPAL
        ============================== */

        const coverFile =
            req.files?.coverImage?.[0];


        /*
            Se uma imagem nova for enviada,
            substitui a antiga.

            Se não for enviada,
            mantém a imagem que já existia.
        */

        const imageUrl =
            coverFile
                ? buildImageUrl(
                    req,
                    coverFile.filename
                )
                : currentVehicle.image_url;


        /* ==============================
           ATUALIZAR VEÍCULO
        ============================== */

        const result =
            await client.query(
                `
                UPDATE vehicles

                SET
                    brand = $1,
                    model = $2,
                    year = $3,
                    price = $4,
                    mileage = $5,
                    fuel = $6,
                    transmission = $7,
                    body_type = $8,
                    color = $9,
                    description = $10,
                    status = $11,
                    image_url = $12

                WHERE id = $13

                RETURNING *
                `,
                [
                    brand,
                    model,
                    Number(year),
                    Number(price),
                    nullable(mileage),
                    nullable(fuel),
                    nullable(transmission),
                    nullable(body_type),
                    nullable(color),
                    nullable(description),
                    status || "available",
                    imageUrl,
                    id
                ]
            );


        /* ==============================
           ADICIONAR NOVAS FOTOS
           À GALERIA
        ============================== */

        const galleryFiles =
            req.files?.galleryImages || [];


        for (const file of galleryFiles) {

            const galleryImageUrl =
                buildImageUrl(
                    req,
                    file.filename
                );


            await client.query(
                `
                INSERT INTO vehicle_images (
                    vehicle_id,
                    image_url,
                    is_cover
                )
                VALUES ($1, $2, $3)
                `,
                [
                    id,
                    galleryImageUrl,
                    false
                ]
            );

        }


        await client.query("COMMIT");


        res.json({
            message:
                "Veículo atualizado com sucesso!",
            vehicle: result.rows[0]
        });


    } catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Erro ao atualizar veículo:",
            error
        );


        res.status(500).json({
            error:
                "Erro interno do servidor."
        });

    } finally {

        client.release();

    }

};


/* ==========================================
   EXCLUIR VEÍCULO
========================================== */

const deleteVehicle = async (req, res) => {

    try {

        const id =
            Number(req.params.id);


        const result =
            await pool.query(
                `
                DELETE FROM vehicles
                WHERE id = $1
                RETURNING *
                `,
                [id]
            );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error:
                    "Veículo não encontrado."
            });

        }


        res.json({
            message:
                "Veículo excluído com sucesso!",
            vehicle:
                result.rows[0]
        });


    } catch (error) {

        console.error(
            "Erro ao excluir veículo:",
            error
        );


        res.status(500).json({
            error:
                "Erro interno do servidor."
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