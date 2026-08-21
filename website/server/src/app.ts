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

// Composing a post is deliberate and rare — 20 an hour is generous for a human
// and useless for a spammer.
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — try again in an hour." },
});

// Voting is the opposite: reading down the board and upvoting a dozen ideas in
// a sitting is exactly the behaviour we want, so it gets its own, roomier
// budget. It used to share writeLimiter and locked people out after 20 votes.
const voteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many votes — try again in an hour." },
});

// Signing up gets its own budget rather than sharing writeLimiter's. One
// rateLimit instance is one counter, so sharing it meant a visitor who used up
// their 20 posts for the hour could no longer create an account either.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-ups from here — try again in an hour." },
});

// Credential endpoints are guessing targets, so they are capped per IP
// regardless of which account is being tried.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts — try again in a few minutes." },
});

app.get("/health", (_req, res) => {
  res.json({ status: mongoose.connection.readyState === 1 ? "ok" : "degraded" });
});

// Mounted before the routers so they actually see the request first; a limiter
// registered after a matching route never runs for that route. `req.path` here
// is relative to the mount, so "/" is POST /api/posts and nothing else —
// matching on req.method alone also caught POST /api/posts/:id/vote.
app.use("/api/posts", (req, res, next) => {
  if (req.method !== "POST") return next();
  return req.path === "/" ? writeLimiter(req, res, next) : voteLimiter(req, res, next);
});
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/admin/login", authLimiter);
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
