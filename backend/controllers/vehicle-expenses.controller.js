const pool = require("../database/connection");

/* ==========================================
   CONFIGURAÇÕES
========================================== */

const MAX_AMOUNT = 10000000;
const MAX_CATEGORY_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 1000;

/* ==========================================
   AUXILIARES
========================================== */

function validId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
}

function validAmount(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;
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
    Formato esperado:
    YYYY-MM-DD
  */

  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  /*
    Além de verificar se o Date existe,
    comparamos os componentes.

    Isso evita aceitar coisas como:
    2026-02-31
  */

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/* ==========================================
   LISTAR DESPESAS DO VEÍCULO
========================================== */

const getVehicleExpenses = async (req, res) => {
  try {
    /* ======================================
       VALIDAR ID DO VEÍCULO
    ====================================== */

    if (!validId(req.params.vehicleId)) {
      return res.status(400).json({
        error: "ID do veículo inválido.",
      });
    }

    const vehicleId = Number(req.params.vehicleId);

    /* ======================================
       VERIFICAR SE O VEÍCULO EXISTE
    ====================================== */

    const vehicleResult = await pool.query(
      `
        SELECT id
        FROM vehicles
        WHERE id = $1
        `,
      [vehicleId],
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({
        error: "Veículo não encontrado.",
      });
    }

    /* ======================================
       BUSCAR DESPESAS
    ====================================== */

    const result = await pool.query(
      `
        SELECT *
        FROM vehicle_expenses

        WHERE vehicle_id = $1

        ORDER BY
          expense_date DESC,
          id DESC
        `,
      [vehicleId],
    );

    /* ======================================
       CALCULAR TOTAL
    ====================================== */

    const totalResult = await pool.query(
      `
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total

        FROM vehicle_expenses

        WHERE vehicle_id = $1
        `,
      [vehicleId],
    );

    return res.status(200).json({
      expenses: result.rows,

      total: Number(totalResult.rows[0].total),
    });
  } catch (error) {
    console.error("Erro ao buscar despesas:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   CRIAR DESPESA
========================================== */

const createVehicleExpense = async (req, res) => {
  try {
    /* ======================================
       VALIDAR ID DO VEÍCULO
    ====================================== */

    if (!validId(req.params.vehicleId)) {
      return res.status(400).json({
        error: "ID do veículo inválido.",
      });
    }

    const vehicleId = Number(req.params.vehicleId);

    /* ======================================
       BODY SEGURO
    ====================================== */

    const { category, description, amount, expense_date } = req.body || {};

    /* ======================================
       VALIDAR CATEGORIA
    ====================================== */

    if (!validString(category, 1, MAX_CATEGORY_LENGTH)) {
      return res.status(400).json({
        error: "Categoria da despesa inválida.",
      });
    }

    /* ======================================
       VALIDAR VALOR
    ====================================== */

    if (!validAmount(amount)) {
      return res.status(400).json({
        error: "Valor da despesa inválido.",
      });
    }

    /* ======================================
       VALIDAR DESCRIÇÃO
    ====================================== */

    if (!validOptionalString(description, MAX_DESCRIPTION_LENGTH)) {
      return res.status(400).json({
        error: "Descrição da despesa inválida ou muito longa.",
      });
    }

    /* ======================================
       VALIDAR DATA
    ====================================== */

    if (!validDate(expense_date)) {
      return res.status(400).json({
        error: "Data da despesa inválida.",
      });
    }

    /* ======================================
       NORMALIZAR DADOS
    ====================================== */

    const normalizedCategory = category.trim();

    const normalizedDescription =
      typeof description === "string" && description.trim()
        ? description.trim()
        : null;

    const normalizedAmount = Number(amount);

    const normalizedDate = expense_date || null;

    /* ======================================
       VERIFICAR SE VEÍCULO EXISTE
    ====================================== */

    const vehicleResult = await pool.query(
      `
        SELECT id
        FROM vehicles
        WHERE id = $1
        `,
      [vehicleId],
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({
        error: "Veículo não encontrado.",
      });
    }

    /* ======================================
       CADASTRAR DESPESA
    ====================================== */

    const result = await pool.query(
      `
        INSERT INTO vehicle_expenses (
          vehicle_id,
          category,
          description,
          amount,
          expense_date
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          COALESCE(
            $5,
            CURRENT_DATE
          )
        )

        RETURNING *
        `,
      [
        vehicleId,
        normalizedCategory,
        normalizedDescription,
        normalizedAmount,
        normalizedDate,
      ],
    );

    return res.status(201).json({
      message: "Despesa cadastrada com sucesso!",

      expense: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao cadastrar despesa:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   EXCLUIR DESPESA
========================================== */

const deleteVehicleExpense = async (req, res) => {
  try {
    /* ======================================
       VALIDAR ID
    ====================================== */

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "ID da despesa inválido.",
      });
    }

    const id = Number(req.params.id);

    /* ======================================
       EXCLUIR
    ====================================== */

    const result = await pool.query(
      `
        DELETE FROM vehicle_expenses

        WHERE id = $1

        RETURNING *
        `,
      [id],
    );

    /* ======================================
       NÃO ENCONTRADA
    ====================================== */

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Despesa não encontrada.",
      });
    }

    return res.status(200).json({
      message: "Despesa excluída com sucesso!",

      expense: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao excluir despesa:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/* ==========================================
   EXPORTS
========================================== */

module.exports = {
  getVehicleExpenses,
  createVehicleExpense,
  deleteVehicleExpense,
};
