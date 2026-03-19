import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  override: true,
});

const { default: assistantRoutes } = await import("./routes/assistantRoutes.js");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use(morgan("dev"));

app.use("/", assistantRoutes);

app.use((err, _req, res, _next) => {
  console.error("[backend] uncaught express error", err);
  const status = Number(err?.status || err?.statusCode || 500);
  res.status(status).json({
    ok: false,
    route: "middleware",
    state: "error",
    provider: "none",
    mode: "error",
    reply: err?.message || "Internal server error.",
    audioUrl: null,
    meta: {},
    error: {
      code: err?.code || "INTERNAL_ERROR",
      message: err?.message || "Internal server error.",
    },
  });
});

app.listen(PORT, () => {
  console.log(`DevVoice OS backend listening on http://localhost:${PORT}`);
  console.log(`[backend] allowed frontend origins: ${allowedOrigins.join(", ")}`);
});
