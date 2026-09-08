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
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://sistema-concessionaria-mocha.vercel.app",
  "https://car-dealer-z468.onrender.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Origem bloqueada pelo CORS:", origin);
        callback(new Error("Origem não permitida pelo CORS"));
      }
    },
    credentials: true,
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
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/integrations/meta", require("./routes/meta.routes"));
app.use("/api/dispatcher", require("./routes/dispatcher.routes"));
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
