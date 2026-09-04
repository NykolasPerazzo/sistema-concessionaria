require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const settingsRoutes = require("./routes/settings.routes");
const pool = require("./database/connection");
const vehiclesRoutes = require("./routes/vehicles.routes");
const vehicleImagesRoutes = require("./routes/vehicle-images.routes");
const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");

const app = express();
const aiRoutes = require("./routes/ai.routes");

/*
 * Necessário no Render (e qualquer host atrás de
 * proxy/load balancer) para que req.protocol e o
 * IP do cliente sejam detectados corretamente via
 * cabeçalhos X-Forwarded-*.
 */
app.set("trust proxy", 1);

const path = require("path");
const fs = require("fs");
const vehicleExpensesRoutes = require("./routes/vehicle-expenses.routes");
const PORT = process.env.PORT || 3000;

/*
 * Em produção, defina ALLOWED_ORIGINS no .env
 * (domínios separados por vírgula). Sem essa
 * variável, assume-se ambiente de desenvolvimento
 * local.
 */
const defaultLocalOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.2.102:5500",
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : defaultLocalOrigins;

/*
 * Recebe req (não só a Origin) para poder liberar
 * automaticamente a própria origem do servidor —
 * assim o front e a API funcionam juntos em qualquer
 * domínio, sem precisar configurar ALLOWED_ORIGINS
 * toda vez que o domínio de produção mudar.
 */
app.use(
  cors(function (req, callback) {
    const origin = req.header("Origin");

    const ownOrigin = `${req.protocol}://${req.get("host")}`;

    const allowed =
      !origin || origin === ownOrigin || allowedOrigins.includes(origin);

    callback(
      allowed ? null : new Error("Origem não permitida pelo CORS."),
      { origin: allowed, credentials: true },
    );
  }),
);

app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }),
);
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      },
    },
  }),
);
app.use(cookieParser());

app.use("/api/vehicle-images", vehicleImagesRoutes);
app.use("/api/auth", authRoutes);

app.use("/api/vehicle-expenses", vehicleExpensesRoutes);

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/sales", require("./routes/sales.routes"));
app.use("/api/proposals", require("./routes/proposals.routes"));
app.use("/api/customers", require("./routes/customers.routes"));
app.use("/api/leads", require("./routes/leads.routes"));
app.use("/api/integrations/meta", require("./routes/meta.routes"));
app.use("/api/settings", settingsRoutes);
app.use("/api/ai", aiRoutes);

// Usado pelo health check do Render
app.get("/api/health", (req, res) => {
  res.json({
    message: "Car Dealer IA API funcionando!",
  });
});

pool.query("SELECT NOW()", (error, result) => {
  if (error) {
    console.error("Erro ao conectar ao PostgreSQL:", error);
  } else {
    console.log("PostgreSQL conectado!");
    console.log("Horário do banco:", result.rows[0].now);
  }
});

app.use("/api/vehicles", vehiclesRoutes);

/*
 * Garante que a pasta exista mesmo em um disco novo
 * (ex.: disco persistente recém-criado no Render).
 */
fs.mkdirSync(path.join(__dirname, "uploads", "vehicles"), {
  recursive: true,
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve o frontend (site público + admin) a partir do mesmo domínio/porta
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  require("./services/meta-leads.service")
    .recoverPending()
    .catch((error) =>
      console.error("Falha ao recuperar webhooks Meta:", error.message),
    );
});
