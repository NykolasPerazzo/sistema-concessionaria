const clients = new Set();

function subscribe(res) {
  clients.add(res);
  return () => clients.delete(res);
}

function notifyNewLead(lead) {
  const payload = JSON.stringify({
    type: "new_lead",
    lead: {
      id: lead.id,
      name: lead.name,
      source: lead.source,
      vehicle_label: lead.vehicle_label || lead.interest_text || null,
      created_at: lead.created_at,
    },
  });

  for (const client of clients) {
    client.write(`event: new_lead\ndata: ${payload}\n\n`);
  }
}

module.exports = { subscribe, notifyNewLead };
