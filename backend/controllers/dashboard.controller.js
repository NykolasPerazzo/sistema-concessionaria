const pool = require("../database/connection");

/* ==========================================
   RESUMO DO DASHBOARD
========================================== */

const getDashboardSummary = async (req, res) => {
  try {
    /* ======================================
       DADOS DOS VEÍCULOS
    ====================================== */

    const vehiclesResult = await pool.query(`
      SELECT

        COUNT(*) AS total_vehicles,

        COUNT(*) FILTER (
          WHERE status = 'available'
        ) AS available_vehicles,

        COUNT(*) FILTER (
          WHERE status = 'reserved'
        ) AS reserved_vehicles,

        COUNT(*) FILTER (
          WHERE status = 'sold'
        ) AS sold_vehicles,

        COALESCE(
          SUM(purchase_price)
          FILTER (
            WHERE status != 'sold'
          ),
          0
        ) AS invested_stock,

        COALESCE(
          SUM(price)
          FILTER (
            WHERE status != 'sold'
          ),
          0
        ) AS advertised_stock,

        MIN(entry_date)
        FILTER (
          WHERE status != 'sold'
        ) AS oldest_entry_date

      FROM vehicles
    `);

    /* ======================================
       DESPESAS
    ====================================== */

    const expensesResult = await pool.query(`
      SELECT

        COALESCE(
          SUM(ve.amount),
          0
        ) AS total_expenses,

        COALESCE(
          SUM(ve.amount)
          FILTER (
            WHERE v.status != 'sold'
          ),
          0
        ) AS stock_expenses

      FROM vehicle_expenses ve

      INNER JOIN vehicles v
        ON v.id = ve.vehicle_id
    `);

    /* ======================================
       VEÍCULOS MAIS ANTIGOS NO ESTOQUE
    ====================================== */

    const oldVehiclesResult = await pool.query(`
      SELECT
        id,
        brand,
        model,
        price,
        purchase_price,
        image_url,
        entry_date,
        status,
        CURRENT_DATE - entry_date
          AS days_in_stock
      FROM vehicles
      WHERE
        status != 'sold'
        AND entry_date IS NOT NULL
      ORDER BY entry_date ASC
      LIMIT 5
    `);

    /* ======================================
       RESULTADOS
    ====================================== */

    const vehicleSummary = vehiclesResult.rows[0];

    const expenseSummary = expensesResult.rows[0];

    const oldVehicles = oldVehiclesResult.rows;

    /* ======================================
       CONVERSÃO DOS VALORES
    ====================================== */

    const totalVehicles = Number(vehicleSummary.total_vehicles || 0);

    const availableVehicles = Number(vehicleSummary.available_vehicles || 0);

    const reservedVehicles = Number(vehicleSummary.reserved_vehicles || 0);

    const soldVehicles = Number(vehicleSummary.sold_vehicles || 0);

    const investedStock = Number(vehicleSummary.invested_stock || 0);

    const advertisedStock = Number(vehicleSummary.advertised_stock || 0);

    const stockExpenses = Number(expenseSummary.stock_expenses || 0);

    const totalExpenses = Number(expenseSummary.total_expenses || 0);

    /* ======================================
       CUSTO TOTAL DO ESTOQUE
    ====================================== */

    const totalCost = investedStock + stockExpenses;

    /* ======================================
       LUCRO POTENCIAL
    ====================================== */

    const potentialProfit = advertisedStock - totalCost;

    /* ======================================
       MARGEM POTENCIAL
    ====================================== */

    const potentialMargin =
      totalCost > 0 ? (potentialProfit / totalCost) * 100 : 0;

    /* ======================================
       DATA MAIS ANTIGA DO ESTOQUE
    ====================================== */

    const oldestEntryDate = vehicleSummary.oldest_entry_date || null;

    /* ======================================
       FORMATAR VEÍCULOS ANTIGOS
    ====================================== */

    const formattedOldVehicles = oldVehicles.map((vehicle) => {
      const purchasePrice = Number(vehicle.purchase_price || 0);

      const price = Number(vehicle.price || 0);

      return {
        id: vehicle.id,

        brand: vehicle.brand,

        model: vehicle.model,

        image_url: vehicle.image_url,

        price,

        purchasePrice,

        entryDate: vehicle.entry_date,

        status: vehicle.status,

        daysInStock: Number(vehicle.days_in_stock || 0),
      };
    });

    /* ======================================
       RESPOSTA
    ====================================== */

    res.status(200).json({
      totalVehicles,

      availableVehicles,

      reservedVehicles,

      soldVehicles,

      investedStock,

      stockExpenses,

      totalCost,

      advertisedStock,

      potentialProfit,

      potentialMargin,

      totalExpenses,

      oldestEntryDate,

      oldVehicles: formattedOldVehicles,
    });
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

module.exports = {
  getDashboardSummary,
};
