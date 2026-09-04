const pool = require("../database/connection");
const cloudinaryService = require("../services/cloudinary.service");

/* ==========================================
   CONFIGURAÇÕES
========================================== */

const ALLOWED_STATUS = ["available", "reserved", "sold"];

const MAX_PRICE = 100000000;
const MAX_MILEAGE = 10000000;

/* ==========================================
   AUXILIARES
========================================== */

function nullable(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number(value);
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
}

function validId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
}

function validNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= min && number <= max;
}

function validOptionalNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  return validNumber(value, min, max);
}

function validString(value, minLength, maxLength) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();

  return normalized.length >= minLength && normalized.length <= maxLength;
}

function validOptionalString(value, maxLength) {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  return validString(value, 1, maxLength);
}

function validDate(value) {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  /*
    Aceita o formato utilizado normalmente
    pelo <input type="date">
    Exemplo: 2026-09-01
  */

  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

/* ==========================================
   LIMPAR IMAGENS JÁ ENVIADAS AO CLOUDINARY
   EM CASO DE ERRO NA REQUISIÇÃO
========================================== */

async function removeUploadedImages(publicIds) {
  for (const publicId of publicIds) {
    await cloudinaryService.deleteAsset(publicId);
  }
}

function hasUploadedFiles(req) {
  return Boolean(req.files?.coverImage?.[0] || req.files?.galleryImages?.length);
}

/* ==========================================
   VALIDAR DADOS DO VEÍCULO
========================================== */

function validateVehicleData(data) {
  const {
    brand,
    model,
    year,
    price,
    purchase_price,
    entry_date,
    sale_price,
    mileage,
    fuel,
    transmission,
    body_type,
    color,
    description,
    status,
  } = data;

  /* ======================================
     MARCA
  ====================================== */

  if (!validString(brand, 1, 50)) {
    return {
      valid: false,
      error: "Marca inválida. Informe uma marca com até 50 caracteres.",
    };
  }

  /* ======================================
     MODELO
  ====================================== */

  if (!validString(model, 1, 80)) {
    return {
      valid: false,
      error: "Modelo inválido. Informe um modelo com até 80 caracteres.",
    };
  }

  /* ======================================
     ANO
  ====================================== */

  const currentYear = new Date().getFullYear();

  if (!validNumber(year, 1886, currentYear + 2)) {
    return {
      valid: false,
      error: `Ano inválido. Informe um ano entre 1886 e ${currentYear + 2}.`,
    };
  }

  /* ======================================
     PREÇO
  ====================================== */

  if (!validNumber(price, 0, MAX_PRICE)) {
    return {
      valid: false,
      error: "Preço do veículo inválido.",
    };
  }

  /* ======================================
     PREÇO DE COMPRA
  ====================================== */

  if (!validOptionalNumber(purchase_price, 0, MAX_PRICE)) {
    return {
      valid: false,
      error: "Preço de compra inválido.",
    };
  }

  /* ======================================
     PREÇO DE VENDA
  ====================================== */

  if (!validOptionalNumber(sale_price, 0, MAX_PRICE)) {
    return {
      valid: false,
      error: "Preço de venda inválido.",
    };
  }

  /* ======================================
     QUILOMETRAGEM
  ====================================== */

  if (!validOptionalNumber(mileage, 0, MAX_MILEAGE)) {
    return {
      valid: false,
      error: "Quilometragem inválida.",
    };
  }

  /* ======================================
     DATA DE ENTRADA
  ====================================== */

  if (!validDate(entry_date)) {
    return {
      valid: false,
      error: "Data de entrada inválida.",
    };
  }

  /* ======================================
     COMBUSTÍVEL
  ====================================== */

  if (!validOptionalString(fuel, 40)) {
    return {
      valid: false,
      error: "Combustível inválido.",
    };
  }

  /* ======================================
     CÂMBIO
  ====================================== */

  if (!validOptionalString(transmission, 40)) {
    return {
      valid: false,
      error: "Tipo de câmbio inválido.",
    };
  }

  /* ======================================
     CARROCERIA
  ====================================== */

  if (!validOptionalString(body_type, 50)) {
    return {
      valid: false,
      error: "Tipo de carroceria inválido.",
    };
  }

  /* ======================================
     COR
  ====================================== */

  if (!validOptionalString(color, 40)) {
    return {
      valid: false,
      error: "Cor inválida.",
    };
  }

  /* ======================================
     DESCRIÇÃO
  ====================================== */

  if (!validOptionalString(description, 5000)) {
    return {
      valid: false,
      error: "Descrição inválida ou muito longa.",
    };
  }

  /* ======================================
     STATUS
  ====================================== */

  if (
    status !== undefined &&
    status !== null &&
    status !== "" &&
    (typeof status !== "string" ||
      !ALLOWED_STATUS.includes(status.trim().toLowerCase()))
  ) {
    return {
      valid: false,
      error: "Status do veículo inválido.",
    };
  }

  return {
    valid: true,
  };
}

/* ==========================================
   NORMALIZAR DADOS
========================================== */

function normalizeVehicleData(data) {
  return {
    brand: normalizeString(data.brand),

    model: normalizeString(data.model),

    year: Number(data.year),

    price: Number(data.price),

    purchase_price: nullableNumber(data.purchase_price),

    entry_date: nullable(data.entry_date),

    sale_price: nullableNumber(data.sale_price),

    mileage: nullableNumber(data.mileage),

    fuel: nullable(normalizeString(data.fuel)),

    transmission: nullable(normalizeString(data.transmission)),

    body_type: nullable(normalizeString(data.body_type)),

    color: nullable(normalizeString(data.color)),

    description: nullable(normalizeString(data.description)),

    status: data.status ? data.status.trim().toLowerCase() : "available",
  };
}

/* ==========================================
   LISTAR VEÍCULOS
========================================== */

const getVehicles = async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT *
        FROM vehicles
        ORDER BY id DESC
        `,
    );

    return res.status(200).json({
      message: "Veículos encontrados com sucesso!",
      vehicles: result.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar veículos:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   BUSCAR VEÍCULO POR ID
========================================== */

const getVehicleById = async (req, res) => {
  try {
    /* ======================================
       VALIDAR ID
    ====================================== */

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "ID do veículo inválido.",
      });
    }

    const id = Number(req.params.id);

    const result = await pool.query(
      `
        SELECT *
        FROM vehicles
        WHERE id = $1
        `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Veículo não encontrado.",
      });
    }

    return res.status(200).json({
      message: "Veículo encontrado com sucesso!",

      vehicle: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao buscar veículo:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   CRIAR VEÍCULO
========================================== */

const createVehicle = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  let transactionCompleted = false;

  const uploadedPublicIds = [];

  try {
    const body = req.body || {};

    /* ======================================
       VALIDAR DADOS
    ====================================== */

    const validation = validateVehicleData(body);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    /* ======================================
       CLOUDINARY CONFIGURADO?
    ====================================== */

    if (hasUploadedFiles(req) && !cloudinaryService.configured()) {
      return res.status(503).json({
        error:
          "Upload de imagens indisponível: integração com Cloudinary não configurada.",
      });
    }

    /* ======================================
       NORMALIZAR DADOS
    ====================================== */

    const vehicleData = normalizeVehicleData(body);

    /* ======================================
       INICIAR TRANSAÇÃO
    ====================================== */

    await client.query("BEGIN");

    transactionStarted = true;

    /* ======================================
       CRIAR VEÍCULO (SEM IMAGEM AINDA)
    ====================================== */

    const result = await client.query(
      `
        INSERT INTO vehicles (
          brand,
          model,
          year,
          price,
          purchase_price,
          entry_date,
          sale_price,
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
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          NULL
        )

        RETURNING *
        `,
      [
        vehicleData.brand,
        vehicleData.model,
        vehicleData.year,
        vehicleData.price,

        vehicleData.purchase_price,

        vehicleData.entry_date,

        vehicleData.sale_price,

        vehicleData.mileage,
        vehicleData.fuel,
        vehicleData.transmission,
        vehicleData.body_type,
        vehicleData.color,
        vehicleData.description,

        vehicleData.status,
      ],
    );

    const vehicle = result.rows[0];

    /* ======================================
       IMAGEM PRINCIPAL
    ====================================== */

    const coverFile = req.files?.coverImage?.[0];

    if (coverFile) {
      const uploaded = await cloudinaryService.uploadBuffer(coverFile.buffer, {
        folder: `car-dealer/vehicles/${vehicle.id}`,
        publicId: "cover",
      });

      uploadedPublicIds.push(uploaded.public_id);

      await client.query(
        `
          UPDATE vehicles
          SET image_url = $1, image_public_id = $2
          WHERE id = $3
        `,
        [uploaded.secure_url, uploaded.public_id, vehicle.id],
      );

      vehicle.image_url = uploaded.secure_url;
      vehicle.image_public_id = uploaded.public_id;
    }

    /* ======================================
       GALERIA
    ====================================== */

    const galleryFiles = req.files?.galleryImages || [];

    for (const file of galleryFiles) {
      const uploaded = await cloudinaryService.uploadBuffer(file.buffer, {
        folder: `car-dealer/vehicles/${vehicle.id}`,
      });

      uploadedPublicIds.push(uploaded.public_id);

      await client.query(
        `
        INSERT INTO vehicle_images (
          vehicle_id,
          image_url,
          public_id,
          is_cover
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        `,
        [vehicle.id, uploaded.secure_url, uploaded.public_id, false],
      );
    }

    /* ======================================
       FINALIZAR TRANSAÇÃO
    ====================================== */

    await client.query("COMMIT");

    transactionCompleted = true;

    return res.status(201).json({
      message: "Veículo cadastrado com sucesso!",

      vehicle,
    });
  } catch (error) {
    if (transactionStarted && !transactionCompleted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Erro no rollback:", rollbackError);
      }
    }

    /*
      Como o cadastro falhou, removemos do
      Cloudinary as imagens já enviadas nesta
      requisição, para não ficarem órfãs.
    */

    await removeUploadedImages(uploadedPublicIds);

    console.error("Erro ao cadastrar veículo:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
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

  let transactionStarted = false;

  let transactionCompleted = false;

  const uploadedPublicIds = [];

  try {
    /* ======================================
       VALIDAR ID
    ====================================== */

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "ID do veículo inválido.",
      });
    }

    const id = Number(req.params.id);

    const body = req.body || {};

    /* ======================================
       VALIDAR DADOS
    ====================================== */

    const validation = validateVehicleData(body);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    /* ======================================
       CLOUDINARY CONFIGURADO?
    ====================================== */

    if (hasUploadedFiles(req) && !cloudinaryService.configured()) {
      return res.status(503).json({
        error:
          "Upload de imagens indisponível: integração com Cloudinary não configurada.",
      });
    }

    /* ======================================
       NORMALIZAR DADOS
    ====================================== */

    const vehicleData = normalizeVehicleData(body);

    /* ======================================
       INICIAR TRANSAÇÃO
    ====================================== */

    await client.query("BEGIN");

    transactionStarted = true;

    /* ======================================
       VERIFICAR VEÍCULO
    ====================================== */

    const currentVehicleResult = await client.query(
      `
        SELECT *
        FROM vehicles
        WHERE id = $1 FOR UPDATE
        `,
      [id],
    );

    if (currentVehicleResult.rows.length === 0) {
      await client.query("ROLLBACK");

      transactionCompleted = true;

      return res.status(404).json({
        error: "Veículo não encontrado.",
      });
    }

    const currentVehicle = currentVehicleResult.rows[0];
    const activeSale = await client.query(
      "SELECT id FROM sales WHERE vehicle_id=$1 AND cancelled_at IS NULL", [id]
    );
    if (activeSale.rows.length && (
      vehicleData.status !== "sold" ||
      vehicleData.sale_price !== Number(currentVehicle.sale_price) ||
      vehicleData.purchase_price !== Number(currentVehicle.purchase_price)
    )) {
      await client.query("ROLLBACK");
      transactionCompleted = true;
      return res.status(409).json({ error: "Este veículo tem venda registrada. Cancele a venda na área de Vendas antes de alterar status ou valores financeiros." });
    }

    /* ======================================
       NOVA IMAGEM PRINCIPAL
    ====================================== */

    const coverFile = req.files?.coverImage?.[0];

    /*
      Se uma imagem nova for enviada, sobe pro
      Cloudinary (mesmo public_id "cover",
      substituindo a versão anterior no próprio
      Cloudinary). Sem imagem nova, mantém a atual
      (inclusive imagens antigas em /uploads).
    */

    let imageUrl = currentVehicle.image_url;
    let imagePublicId = currentVehicle.image_public_id;

    if (coverFile) {
      const uploaded = await cloudinaryService.uploadBuffer(coverFile.buffer, {
        folder: `car-dealer/vehicles/${id}`,
        publicId: "cover",
      });

      uploadedPublicIds.push(uploaded.public_id);

      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }

    /* ======================================
       ATUALIZAR VEÍCULO
    ====================================== */

    const result = await client.query(
      `
        UPDATE vehicles

        SET
          brand = $1,
          model = $2,
          year = $3,
          price = $4,
          purchase_price = $5,
          entry_date = $6,
          sale_price = $7,
          mileage = $8,
          fuel = $9,
          transmission = $10,
          body_type = $11,
          color = $12,
          description = $13,
          status = $14,
          image_url = $15,
          image_public_id = $16

        WHERE id = $17

        RETURNING *
        `,
      [
        vehicleData.brand,
        vehicleData.model,
        vehicleData.year,
        vehicleData.price,

        vehicleData.purchase_price,

        vehicleData.entry_date,

        vehicleData.sale_price,

        vehicleData.mileage,
        vehicleData.fuel,
        vehicleData.transmission,
        vehicleData.body_type,
        vehicleData.color,
        vehicleData.description,

        vehicleData.status,

        imageUrl,
        imagePublicId,

        id,
      ],
    );

    /* ======================================
       ADICIONAR NOVAS FOTOS
       À GALERIA
    ====================================== */

    const galleryFiles = req.files?.galleryImages || [];

    for (const file of galleryFiles) {
      const uploaded = await cloudinaryService.uploadBuffer(file.buffer, {
        folder: `car-dealer/vehicles/${id}`,
      });

      uploadedPublicIds.push(uploaded.public_id);

      await client.query(
        `
        INSERT INTO vehicle_images (
          vehicle_id,
          image_url,
          public_id,
          is_cover
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        `,
        [id, uploaded.secure_url, uploaded.public_id, false],
      );
    }

    /* ======================================
       FINALIZAR TRANSAÇÃO
    ====================================== */

    await client.query("COMMIT");

    transactionCompleted = true;

    return res.status(200).json({
      message: "Veículo atualizado com sucesso!",

      vehicle: result.rows[0],
    });
  } catch (error) {
    if (transactionStarted && !transactionCompleted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Erro no rollback:", rollbackError);
      }
    }

    /*
      Se o update falhar, remove do Cloudinary
      somente as imagens enviadas nesta requisição.
    */

    await removeUploadedImages(uploadedPublicIds);

    console.error("Erro ao atualizar veículo:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
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
    /* ======================================
       VALIDAR ID
    ====================================== */

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "ID do veículo inválido.",
      });
    }

    const id = Number(req.params.id);

    const result = await pool.query(
      `
        DELETE FROM vehicles
        WHERE id = $1
        RETURNING *
        `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Veículo não encontrado.",
      });
    }

    /*
      Remove as imagens do veículo no Cloudinary
      (best-effort — falha aqui não desfaz a
      exclusão já confirmada no banco).
    */

    cloudinaryService
      .deleteFolder(`car-dealer/vehicles/${id}`)
      .catch((error) =>
        console.error("Erro ao limpar pasta do Cloudinary:", error.message),
      );

    return res.status(200).json({
      message: "Veículo excluído com sucesso!",

      vehicle: result.rows[0],
    });
  } catch (error) {
    /*
      23503 = violação de chave estrangeira (INSERT/UPDATE).
      23001 = violação de RESTRICT em DELETE (o caso real aqui,
      ex.: veículo com venda vinculada).
    */
    if (error.code === "23503" || error.code === "23001") {
      return res.status(409).json({ error: "Este veículo possui registros vinculados e não pode ser excluído. O histórico de vendas deve ser preservado." });
    }
    console.error("Erro ao excluir veículo:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   EXPORTS
========================================== */

module.exports = {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};
