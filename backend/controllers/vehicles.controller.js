const fs = require("fs");
const pool = require("../database/connection");

/* ==========================================
   CONFIGURAÇÕES
========================================== */

const ALLOWED_STATUS = ["available", "reserved", "sold"];

const MAX_PRICE = 100000000;
const MAX_MILEAGE = 10000000;

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
   LIMPAR ARQUIVOS DE UPLOAD EM CASO
   DE ERRO OU VALIDAÇÃO INVÁLIDA
========================================== */

function removeUploadedFiles(req) {
  if (!req.files) {
    return;
  }

  const files = [];

  if (Array.isArray(req.files.coverImage)) {
    files.push(...req.files.coverImage);
  }

  if (Array.isArray(req.files.galleryImages)) {
    files.push(...req.files.galleryImages);
  }

  for (const file of files) {
    if (!file?.path) {
      continue;
    }

    fs.unlink(file.path, (error) => {
      if (error && error.code !== "ENOENT") {
        console.error("Erro ao remover arquivo:", error);
      }
    });
  }
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

  try {
    const body = req.body || {};

    /* ======================================
       VALIDAR DADOS
    ====================================== */

    const validation = validateVehicleData(body);

    if (!validation.valid) {
      removeUploadedFiles(req);

      return res.status(400).json({
        error: validation.error,
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
       IMAGEM PRINCIPAL
    ====================================== */

    const coverFile = req.files?.coverImage?.[0];

    const imageUrl = coverFile ? buildImageUrl(req, coverFile.filename) : null;

    /* ======================================
       CRIAR VEÍCULO
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
          $15
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

        imageUrl,
      ],
    );

    const vehicle = result.rows[0];

    /* ======================================
       GALERIA
    ====================================== */

    const galleryFiles = req.files?.galleryImages || [];

    for (const file of galleryFiles) {
      const galleryImageUrl = buildImageUrl(req, file.filename);

      await client.query(
        `
        INSERT INTO vehicle_images (
          vehicle_id,
          image_url,
          is_cover
        )

        VALUES (
          $1,
          $2,
          $3
        )
        `,
        [vehicle.id, galleryImageUrl, false],
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
      Como ocorreu erro no banco,
      removemos os arquivos recém-enviados
      para evitar arquivos órfãos.
    */

    removeUploadedFiles(req);

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

  try {
    /* ======================================
       VALIDAR ID
    ====================================== */

    if (!validId(req.params.id)) {
      removeUploadedFiles(req);

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
      removeUploadedFiles(req);

      return res.status(400).json({
        error: validation.error,
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

      removeUploadedFiles(req);

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
      removeUploadedFiles(req);
      return res.status(409).json({ error: "Este veículo tem venda registrada. Cancele a venda na área de Vendas antes de alterar status ou valores financeiros." });
    }

    /* ======================================
       NOVA IMAGEM PRINCIPAL
    ====================================== */

    const coverFile = req.files?.coverImage?.[0];

    /*
      Se uma imagem nova for enviada,
      substitui a URL anterior.

      Se não houver nova imagem,
      mantém a imagem atual.
    */

    const imageUrl = coverFile
      ? buildImageUrl(req, coverFile.filename)
      : currentVehicle.image_url;

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
          image_url = $15

        WHERE id = $16

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

        id,
      ],
    );

    /* ======================================
       ADICIONAR NOVAS FOTOS
       À GALERIA
    ====================================== */

    const galleryFiles = req.files?.galleryImages || [];

    for (const file of galleryFiles) {
      const galleryImageUrl = buildImageUrl(req, file.filename);

      await client.query(
        `
        INSERT INTO vehicle_images (
          vehicle_id,
          image_url,
          is_cover
        )

        VALUES (
          $1,
          $2,
          $3
        )
        `,
        [id, galleryImageUrl, false],
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
      Se o update falhar,
      remove somente os arquivos
      que acabaram de ser enviados.
    */

    removeUploadedFiles(req);

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

    return res.status(200).json({
      message: "Veículo excluído com sucesso!",

      vehicle: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23503") {
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
