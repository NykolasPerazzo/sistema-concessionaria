const pool = require("../database/connection");
const METHODS = ["pix", "transfer", "cash", "financing", "mixed"];
const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = (value) =>
  ["number", "string"].includes(typeof value) &&
  /^(?:[1-9]\d*)$/.test(String(value)) &&
  Number.isSafeInteger(Number(value));
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function textValue(value, max, required = false) {
  if (value == null && !required) return null;
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  ) {
    throw fail(400, "Confira os campos de texto e seus limites.");
  }
  return value.trim() || null;
}
function money(value) {
  if (
    !["number", "string"].includes(typeof value) ||
    !/^\d+(\.\d{1,2})?$/.test(String(value))
  )
    return false;
  return Number(value) > 0 && Number(value) <= 100000000;
}
function respondError(res, error) {
  if (error.code === "23505")
    return res
      .status(409)
      .json({ error: "Este veículo já possui uma venda registrada." });
  if (!error.status)
    console.error("Erro na área de vendas:", error.code || error.message);
  return res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação de vendas.",
  });
}
async function transaction(action) {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}
async function getSaleVehicles(req, res) {
  try {
    const result =
      await pool.query(`SELECT v.id, v.brand, v.model, v.year, v.price, v.purchase_price,
      v.entry_date::text, v.status, COALESCE(e.total, 0) AS expenses_total
      FROM vehicles v LEFT JOIN (SELECT vehicle_id, SUM(amount) AS total FROM vehicle_expenses GROUP BY vehicle_id) e ON e.vehicle_id = v.id
      WHERE v.status IN ('available','reserved') AND NOT EXISTS
      (SELECT 1 FROM sales s WHERE s.vehicle_id=v.id AND s.cancelled_at IS NULL)
      ORDER BY v.brand, v.model, v.id`);
    res.json({ vehicles: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}
async function getSales(req, res) {
  try {
    const { start, end, status = "active" } = req.query;
    if (
      (start && !validDate(start)) ||
      (end && !validDate(end)) ||
      (start && end && start > end)
    )
      throw fail(400, "Período inválido.");
    if (!["active", "cancelled", "all"].includes(status))
      throw fail(400, "Filtro de vendas inválido.");
    const result = await pool.query(
      `SELECT s.*, s.sale_date::text AS sale_date,
      s.sale_price - s.purchase_price - s.expenses_total AS profit
      FROM sales s WHERE ($1::date IS NULL OR sale_date >= $1)
      AND ($2::date IS NULL OR sale_date <= $2)
      AND ($3 = 'all' OR ($3 = 'active' AND cancelled_at IS NULL) OR ($3 = 'cancelled' AND cancelled_at IS NOT NULL))
      ORDER BY s.sale_date DESC, s.id DESC`,
      [start || null, end || null, status],
    );
    res.json({ sales: result.rows });
  } catch (error) {
    respondError(res, error);
  }
}
async function createSale(req, res) {
  try {
    const body = req.body || {};
    if (!validId(body.vehicle_id)) throw fail(400, "Veículo inválido.");
    if (!money(body.sale_price))
      throw fail(
        400,
        "Informe um valor de venda positivo, com até duas casas decimais.",
      );
    if (!validDate(body.sale_date)) throw fail(400, "Data de venda inválida.");
    if (!METHODS.includes(body.payment_method))
      throw fail(400, "Forma de pagamento inválida.");
    let buyer = textValue(body.buyer_name, 120, true);
    let phone = textValue(body.buyer_phone, 30);
    const notes = textValue(body.notes, 2000);
    const customerId =
      body.customer_id === undefined ||
      body.customer_id === null ||
      body.customer_id === ""
        ? null
        : body.customer_id;
    if (customerId !== null && !validId(customerId))
      throw fail(400, "Cliente inválido.");
    if (body.proposal_id !== undefined && !validId(body.proposal_id))
      throw fail(400, "Proposta inválida.");
    const sale = await transaction(async (client) => {
      const found = await client.query(
        `SELECT *, entry_date::text AS entry_day, CURRENT_DATE::text AS today FROM vehicles WHERE id=$1 FOR UPDATE`,
        [body.vehicle_id],
      );
      const vehicle = found.rows[0];
      if (!vehicle) throw fail(404, "Veículo não encontrado.");
      if (!["available", "reserved"].includes(vehicle.status))
        throw fail(409, "Este veículo não está disponível para venda.");
      if (vehicle.purchase_price == null)
        throw fail(
          409,
          "Cadastre o preço de compra do veículo antes de registrar a venda.",
        );
      if (
        body.sale_date > vehicle.today ||
        (vehicle.entry_day && body.sale_date < vehicle.entry_day)
      )
        throw fail(400, "A data deve estar entre a entrada do veículo e hoje.");
      if (body.proposal_id !== undefined) {
        const proposalResult = await client.query(
          "SELECT *, valid_until::text AS expiry FROM proposals WHERE id=$1 FOR UPDATE",
          [body.proposal_id],
        );
        const proposal = proposalResult.rows[0];
        if (!proposal) throw fail(404, "Proposta não encontrada.");
        if (proposal.status !== "accepted" || proposal.expiry < vehicle.today)
          throw fail(
            409,
            "A proposta precisa estar aceita e dentro da validade.",
          );
        if (
          proposal.vehicle_id !== vehicle.id ||
          proposal.customer_id !==
            (customerId === null ? null : Number(customerId)) ||
          Number(proposal.proposed_price) !== Number(body.sale_price) ||
          proposal.buyer_name !== buyer ||
          proposal.buyer_phone !== phone ||
          proposal.payment_method !== body.payment_method ||
          proposal.notes !== notes
        ) {
          throw fail(
            409,
            "Os dados da proposta mudaram. Recarregue antes de converter.",
          );
        }
      }
      if (customerId !== null) {
        const customer = (
          await client.query("SELECT * FROM customers WHERE id=$1 FOR SHARE", [
            customerId,
          ])
        ).rows[0];
        if (!customer || !customer.is_active)
          throw fail(
            409,
            "Cliente indisponível. Reative o cadastro para continuar.",
          );
        if (body.proposal_id === undefined) {
          buyer = customer.name;
          phone = customer.phone;
        }
      }
      const expenses = await client.query(
        "SELECT COALESCE(SUM(amount),0) AS total FROM vehicle_expenses WHERE vehicle_id=$1",
        [vehicle.id],
      );
      const result = await client.query(
        `INSERT INTO sales
        (vehicle_id,vehicle_label,buyer_name,buyer_phone,sale_date,sale_price,purchase_price,expenses_total,payment_method,notes,previous_status,previous_sale_price,created_by,customer_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          vehicle.id,
          `${vehicle.brand} ${vehicle.model} • ${vehicle.year}`,
          buyer,
          phone,
          body.sale_date,
          body.sale_price,
          vehicle.purchase_price,
          expenses.rows[0].total,
          body.payment_method,
          notes,
          vehicle.status,
          vehicle.sale_price,
          req.user.sub,
          customerId,
        ],
      );
      await client.query(
        "UPDATE vehicles SET status='sold', sale_price=$2 WHERE id=$1",
        [vehicle.id, body.sale_price],
      );
      if (body.proposal_id !== undefined) {
        await client.query(
          "UPDATE proposals SET status='converted', sale_id=$2, version=version+1, updated_at=NOW() WHERE id=$1",
          [body.proposal_id, result.rows[0].id],
        );
      }
      return result.rows[0];
    });
    res
      .status(201)
      .json({ message: "Venda registrada. Estoque atualizado.", sale });
  } catch (error) {
    respondError(res, error);
  }
}
async function cancelSale(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Venda inválida.");
    const reason = textValue(req.body?.reason, 500, true);
    await transaction(async (client) => {
      // Sempre bloquear o veículo antes da venda, na mesma ordem do cadastro.
      const found = await client.query(
        "SELECT vehicle_id FROM sales WHERE id=$1",
        [req.params.id],
      );
      if (!found.rows[0]) throw fail(404, "Venda não encontrada.");
      await client.query("SELECT id FROM vehicles WHERE id=$1 FOR UPDATE", [
        found.rows[0].vehicle_id,
      ]);
      const result = await client.query(
        "SELECT * FROM sales WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      const sale = result.rows[0];
      if (sale.cancelled_at) throw fail(409, "Esta venda já foi cancelada.");
      await client.query(
        "UPDATE sales SET cancelled_at=NOW(), cancelled_by=$2, cancellation_reason=$3 WHERE id=$1",
        [sale.id, req.user.sub, reason],
      );
      await client.query(
        "UPDATE vehicles SET status=$2, sale_price=$3 WHERE id=$1",
        [sale.vehicle_id, sale.previous_status, sale.previous_sale_price],
      );
    });
    res.json({
      message: "Venda cancelada. Veículo devolvido ao status anterior.",
    });
  } catch (error) {
    respondError(res, error);
  }
}
module.exports = {
  getSales,
  getSaleVehicles,
  createSale,
  cancelSale,
  transaction,
  validDate,
  validId,
  textValue,
  money,
  fail,
};
