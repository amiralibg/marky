import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import postRoutes from "./routes/posts.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);

// Writes only — the board list stays open and cheap.
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — try again in an hour." },
});

app.get("/health", (_req, res) => {
  res.json({ status: mongoose.connection.readyState === 1 ? "ok" : "degraded" });
});
// Mounted before the routers so it actually sees the request first; a limiter
// registered after a matching route never runs for that route.
app.use("/api/posts", (req, res, next) => (req.method === "POST" ? writeLimiter(req, res, next) : next()));
app.use("/api/auth/register", writeLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  await mongoose.connect(config.mongodbUri);
  app.listen(config.port, () => {
    console.log(`Feedback API listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
