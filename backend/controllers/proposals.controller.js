const pool = require("../database/connection");
const {
  transaction,
  validDate,
  validId,
  textValue,
  money,
  fail,
  createSale,
} = require("./sales.controller");
const methods = ["pix", "transfer", "cash", "financing", "mixed"];
const transitions = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "rejected", "cancelled"],
  accepted: ["cancelled"],
};
const effective = `CASE WHEN p.status IN ('draft','sent','accepted') AND p.valid_until < CURRENT_DATE THEN 'expired' ELSE p.status END`;
function errorResponse(res, error) {
  if (!error.status)
    console.error("Erro em propostas:", error.code || error.message);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação de propostas.",
  });
}
function validate(body) {
  if (!validId(body.vehicle_id)) throw fail(400, "Veículo inválido.");
  if (!money(body.proposed_price))
    throw fail(400, "Informe um valor positivo com até duas casas decimais.");
  if (!validDate(body.valid_until)) throw fail(400, "Validade inválida.");
  if (!methods.includes(body.payment_method))
    throw fail(400, "Forma de pagamento inválida.");
  return {
    ...body,
    buyer_name: textValue(body.buyer_name, 120, true),
    buyer_phone: textValue(body.buyer_phone, 30),
    notes: textValue(body.notes, 2000),
  };
}
async function vehicleForProposal(client, id, expiry) {
  const r = await client.query(
    "SELECT *, CURRENT_DATE::text AS today FROM vehicles WHERE id=$1 FOR UPDATE",
    [id],
  );
  const v = r.rows[0];
  if (!v) throw fail(404, "Veículo não encontrado.");
  if (!["available", "reserved"].includes(v.status))
    throw fail(409, "O veículo não está disponível para negociação.");
  if (expiry < v.today)
    throw fail(400, "A validade não pode estar no passado.");
  return v;
}
async function getProposals(req, res) {
  try {
    const status = req.query.status || "all";
    if (
      ![
        "all",
        "draft",
        "sent",
        "accepted",
        "rejected",
        "cancelled",
        "converted",
        "expired",
      ].includes(status)
    )
      throw fail(400, "Filtro inválido.");
    const r = await pool.query(
      `SELECT p.*, p.valid_until::text AS valid_until, ${effective} AS effective_status,
    s.cancelled_at AS sale_cancelled_at FROM proposals p LEFT JOIN sales s ON s.id=p.sale_id
    WHERE ($1='all' OR ${effective}=$1) ORDER BY p.created_at DESC,p.id DESC`,
      [status],
    );
    res.json({ proposals: r.rows });
  } catch (error) {
    errorResponse(res, error);
  }
}
async function saveProposal(req, res) {
  try {
    const b = validate(req.body || {}),
      editing = req.params.id !== undefined;
    if (editing && (!validId(req.params.id) || !validId(b.version)))
      throw fail(400, "Proposta ou versão inválida.");
    const customerId =
      b.customer_id === undefined ||
      b.customer_id === null ||
      b.customer_id === ""
        ? null
        : b.customer_id;
    if (customerId !== null && !validId(customerId))
      throw fail(400, "Cliente inválido.");
    const proposal = await transaction(async (client) => {
      // Mesma ordem de bloqueios da conversão: veículo antes da proposta.
      const v = await vehicleForProposal(client, b.vehicle_id, b.valid_until);
      if (editing) {
        const current = (
          await client.query("SELECT * FROM proposals WHERE id=$1 FOR UPDATE", [
            req.params.id,
          ])
        ).rows[0];
        if (!current) throw fail(404, "Proposta não encontrada.");
        if (current.status !== "draft")
          throw fail(409, "Somente rascunhos podem ser editados.");
        if (current.version !== Number(b.version))
          throw fail(
            409,
            "Proposta atualizada em outra janela. Recarregue a página.",
          );
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
        b.buyer_name = customer.name;
        b.buyer_phone = customer.phone;
      }
      const values = [
        v.id,
        `${v.brand} ${v.model} • ${v.year}`,
        b.buyer_name,
        b.buyer_phone,
        b.proposed_price,
        b.payment_method,
        b.valid_until,
        b.notes,
        customerId,
      ];
      const r = editing
        ? await client.query(
            `UPDATE proposals SET vehicle_id=$1,vehicle_label=$2,buyer_name=$3,buyer_phone=$4,proposed_price=$5,payment_method=$6,valid_until=$7,notes=$8,customer_id=$9,version=version+1,updated_at=NOW() WHERE id=$10 RETURNING *`,
            [...values, req.params.id],
          )
        : await client.query(
            `INSERT INTO proposals(vehicle_id,vehicle_label,buyer_name,buyer_phone,proposed_price,payment_method,valid_until,notes,customer_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [...values, req.user.sub],
          );
      return r.rows[0];
    });
    res.status(editing ? 200 : 201).json({ proposal });
  } catch (error) {
    errorResponse(res, error);
  }
}
async function changeStatus(req, res) {
  try {
    const b = req.body || {};
    if (
      !validId(req.params.id) ||
      !validId(b.version) ||
      typeof b.status !== "string"
    )
      throw fail(400, "Dados inválidos.");
    await transaction(async (client) => {
      const first = (
        await client.query("SELECT vehicle_id FROM proposals WHERE id=$1", [
          req.params.id,
        ])
      ).rows[0];
      if (!first) throw fail(404, "Proposta não encontrada.");
      const vehicle = (
        await client.query(
          "SELECT status FROM vehicles WHERE id=$1 FOR UPDATE",
          [first.vehicle_id],
        )
      ).rows[0];
      const p = (
        await client.query(
          "SELECT *, valid_until::text AS expiry, CURRENT_DATE::text AS today FROM proposals WHERE id=$1 FOR UPDATE",
          [req.params.id],
        )
      ).rows[0];
      if (p.version !== Number(b.version) || p.vehicle_id !== first.vehicle_id)
        throw fail(409, "Proposta atualizada. Recarregue a página.");
      if (!transitions[p.status]?.includes(b.status))
        throw fail(409, "Mudança de situação não permitida.");
      if (b.status !== "cancelled" && p.expiry < p.today)
        throw fail(409, "Proposta vencida. Crie uma nova proposta.");
      if (
        b.status !== "cancelled" &&
        !["available", "reserved"].includes(vehicle.status)
      )
        throw fail(409, "Veículo indisponível.");
      await client.query(
        "UPDATE proposals SET status=$2,version=version+1,updated_at=NOW() WHERE id=$1",
        [p.id, b.status],
      );
    });
    res.json({ message: "Situação atualizada." });
  } catch (error) {
    errorResponse(res, error);
  }
}
async function convertProposal(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Proposta inválida.");
    const p = (
      await pool.query("SELECT * FROM proposals WHERE id=$1", [req.params.id])
    ).rows[0];
    if (!p) throw fail(404, "Proposta não encontrada.");
    req.body = {
      proposal_id: p.id,
      customer_id: p.customer_id,
      vehicle_id: p.vehicle_id,
      buyer_name: p.buyer_name,
      buyer_phone: p.buyer_phone,
      sale_price: p.proposed_price,
      payment_method: p.payment_method,
      notes: p.notes,
      sale_date: req.body?.sale_date,
      // Sem escolha explícita no convite de conversão, o vendedor responsável
      // é quem criou a proposta.
      seller_id: req.body?.seller_id ?? p.created_by,
    };
    return createSale(req, res);
  } catch (error) {
    errorResponse(res, error);
  }
}
module.exports = { getProposals, saveProposal, changeStatus, convertProposal };
