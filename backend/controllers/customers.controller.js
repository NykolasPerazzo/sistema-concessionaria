const pool = require("../database/connection");
const { validId, textValue, fail } = require("./sales.controller");
function respondError(res, error) {
  if (!error.status)
    console.error("Erro em clientes:", error.code || error.message);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação de clientes.",
  });
}
function validate(body) {
  const name = textValue(body.name, 120, true),
    phone = textValue(body.phone, 30),
    email = textValue(body.email, 160),
    city = textValue(body.city, 100),
    notes = textValue(body.notes, 2000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw fail(400, "E-mail inválido.");
  if (
    phone &&
    (!/^[+()\d\s.-]+$/.test(phone) ||
      phone.replace(/\D/g, "").length < 8 ||
      phone.replace(/\D/g, "").length > 15)
  )
    throw fail(400, "Informe um telefone com 8 a 15 dígitos.");
  return [name, phone, email, city, notes];
}
async function listCustomers(req, res) {
  try {
    const active = req.query.active || "all";
    if (!["all", "true", "false"].includes(active))
      throw fail(400, "Filtro inválido.");
    const r = await pool.query(
      `SELECT c.*,
 (SELECT COUNT(*) FROM proposals p WHERE p.customer_id=c.id) AS proposals_count,
 (SELECT COUNT(*) FROM sales s WHERE s.customer_id=c.id AND s.cancelled_at IS NULL) AS sales_count,
 (SELECT COALESCE(SUM(s.sale_price),0) FROM sales s WHERE s.customer_id=c.id AND s.cancelled_at IS NULL) AS total_purchased
 FROM customers c WHERE ($1='all' OR c.is_active=($1='true')) ORDER BY c.name,c.id`,
      [active],
    );
    res.json({ customers: r.rows });
  } catch (error) {
    respondError(res, error);
  }
}
async function saveCustomer(req, res) {
  try {
    const body = req.body || {},
      values = validate(body),
      editing = req.params.id !== undefined;
    if (editing && (!validId(req.params.id) || !validId(body.version)))
      throw fail(400, "Cliente ou versão inválida.");
    const r = editing
      ? await pool.query(
          `UPDATE customers SET name=$1,phone=$2,email=$3,city=$4,notes=$5,version=version+1,updated_at=NOW() WHERE id=$6 AND version=$7 RETURNING *`,
          [...values, req.params.id, body.version],
        )
      : await pool.query(
          "INSERT INTO customers(name,phone,email,city,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [...values, req.user.sub],
        );
    if (!r.rows[0])
      throw fail(
        409,
        "Cliente não encontrado ou atualizado em outra janela. Recarregue a lista.",
      );
    res.status(editing ? 200 : 201).json({ customer: r.rows[0] });
  } catch (error) {
    respondError(res, error);
  }
}
async function setCustomerStatus(req, res) {
  try {
    const b = req.body || {};
    if (
      !validId(req.params.id) ||
      !validId(b.version) ||
      typeof b.is_active !== "boolean"
    )
      throw fail(400, "Dados inválidos.");
    const r = await pool.query(
      "UPDATE customers SET is_active=$2,version=version+1,updated_at=NOW() WHERE id=$1 AND version=$3 RETURNING *",
      [req.params.id, b.is_active, b.version],
    );
    if (!r.rows[0])
      throw fail(
        409,
        "Cliente não encontrado ou atualizado em outra janela. Recarregue a lista.",
      );
    res.json({ customer: r.rows[0] });
  } catch (error) {
    respondError(res, error);
  }
}
async function customerHistory(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Cliente inválido.");
    const c = await pool.query("SELECT * FROM customers WHERE id=$1", [
      req.params.id,
    ]);
    if (!c.rows[0]) throw fail(404, "Cliente não encontrado.");
    const proposals = await pool.query(
      `SELECT p.*,p.valid_until::text AS valid_until,CASE WHEN p.status IN ('draft','sent','accepted') AND p.valid_until<CURRENT_DATE THEN 'expired' ELSE p.status END AS effective_status FROM proposals p WHERE customer_id=$1 ORDER BY created_at DESC,id DESC`,
      [req.params.id],
    );
    const sales = await pool.query(
      "SELECT s.*,s.sale_date::text AS sale_date FROM sales s WHERE customer_id=$1 ORDER BY s.sale_date DESC,s.id DESC",
      [req.params.id],
    );
    const leads = await pool.query(
      "SELECT id,name,status,source,vehicle_label FROM leads WHERE customer_id=$1 ORDER BY id DESC",
      [req.params.id],
    );
    res.json({
      leads: leads.rows,
      customer: c.rows[0],
      proposals: proposals.rows,
      sales: sales.rows,
    });
  } catch (error) {
    respondError(res, error);
  }
}
module.exports = {
  validateCustomer: validate,
  listCustomers,
  saveCustomer,
  setCustomerStatus,
  customerHistory,
};
