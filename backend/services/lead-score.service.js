/*
 * Pontuação de prioridade do lead: regras internas e transparentes,
 * SEM chamada de IA. Cada motivo é somado e listado para o vendedor
 * entender exatamente de onde veio a pontuação.
 */

const ENGAGED_ACTION_LABEL =
  "Pediu test drive, proposta ou marcou reunião";

function computeScore(lead, flags = {}) {
  const reasons = [];

  if (lead.purchase_timeframe && lead.purchase_timeframe !== "research_only") {
    reasons.push({ label: "Informou prazo de compra", points: 20 });
  }

  if (lead.vehicle_id) {
    reasons.push({ label: "Escolheu um veículo específico", points: 15 });
  }

  if (flags.askedSimulation) {
    reasons.push({ label: "Pediu simulação de financiamento", points: 15 });
  }

  if (lead.down_payment != null) {
    reasons.push({ label: "Informou valor de entrada", points: 15 });
  }

  if (lead.desired_installment != null) {
    reasons.push({ label: "Informou parcela desejada", points: 10 });
  }

  if (lead.budget != null) {
    reasons.push({ label: "Informou orçamento", points: 10 });
  }

  if (flags.respondedToday) {
    reasons.push({ label: "Respondeu hoje", points: 10 });
  }

  if (flags.engagedAction) {
    reasons.push({ label: ENGAGED_ACTION_LABEL, points: 5 });
  }

  const total = reasons.reduce((sum, r) => sum + r.points, 0);

  return {
    score: Math.min(100, total),
    reasons,
  };
}

function temperature(score) {
  if (score == null) return null;
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

module.exports = { computeScore, temperature };
