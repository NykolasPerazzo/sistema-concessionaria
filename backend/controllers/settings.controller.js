const pool = require("../database/connection");

// Buscar todas as configurações
exports.getSettings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT setting_key, setting_value, setting_type
      FROM settings
      ORDER BY setting_key
    `);

    const settings = {};

    result.rows.forEach((item) => {
      let value = item.setting_value;

      if (item.setting_type === "boolean") {
        value = value === "true";
      }

      if (item.setting_type === "number") {
        value = Number(value);
      }

      settings[item.setting_key] = value;
    });

    return res.json({
      settings,
    });
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);

    return res.status(500).json({
      message: "Erro ao buscar configurações.",
    });
  }
};

// Salvar/atualizar configurações
exports.updateSettings = async (req, res) => {
  const settings = req.body;

  try {
    for (const [key, value] of Object.entries(settings)) {
      let type = "text";

      if (typeof value === "boolean") {
        type = "boolean";
      }

      if (typeof value === "number") {
        type = "number";
      }

      await pool.query(
        `
        INSERT INTO settings (
          setting_key,
          setting_value,
          setting_type
        )
        VALUES ($1, $2, $3)

        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          setting_type = EXCLUDED.setting_type,
          updated_at = CURRENT_TIMESTAMP
        `,
        [key, String(value), type],
      );
    }

    return res.json({
      message: "Configurações atualizadas com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error);

    return res.status(500).json({
      message: "Erro ao atualizar configurações.",
    });
  }
};

// ========================================
// CONFIGURAÇÕES PÚBLICAS
// ========================================

exports.getPublicSettings = async (req, res) => {
  try {
    const publicKeys = [
      "company_name",
      "company_phone",
      "company_whatsapp",
      "company_email",
      "company_city",

      "primary_color",
      "secondary_color",
      "site_theme",

      "site_title",
      "site_description",
      "instagram_url",

      "featured_limit",

      "ai_enabled",
      "ai_welcome_message",
    ];

    const result = await pool.query(
      `
      SELECT
        setting_key,
        setting_value,
        setting_type
      FROM settings
      WHERE setting_key = ANY($1)
      `,
      [publicKeys],
    );

    const settings = {};

    result.rows.forEach((item) => {
      let value = item.setting_value;

      if (item.setting_type === "boolean") {
        value = value === "true";
      }

      if (item.setting_type === "number") {
        value = Number(value);
      }

      settings[item.setting_key] = value;
    });

    return res.json({
      settings,
    });
  } catch (error) {
    console.error("Erro ao buscar configurações públicas:", error);

    return res.status(500).json({
      message: "Erro ao buscar configurações públicas.",
    });
  }
};
