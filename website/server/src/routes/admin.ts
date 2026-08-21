import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config, POST_STATUSES } from "../config.js";
import { HttpError, validate } from "../middleware/error.js";
import { requireAdmin, signAdminToken } from "../middleware/auth.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";

const router = Router();

/** Length-independent constant-time compare so login timing leaks nothing. */
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Accepts either a bcrypt hash ($2…) or plain text in ADMIN_PASSWORD.
function adminPasswordMatches(input: string) {
  return config.adminPassword.startsWith("$2")
    ? bcrypt.compareSync(input, config.adminPassword)
    : safeEqual(input, config.adminPassword);
}

router.post("/login", validate(z.object({ email: z.string().email(), password: z.string() })), async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!safeEqual(email.toLowerCase(), config.adminEmail) || !adminPasswordMatches(password)) {
      throw new HttpError(401, "Wrong email or password.");
    }
    res.json({ token: signAdminToken() });
  } catch (err) {
    next(err);
  }
});

/** Everything the moderation table shows, including who wrote what. */
router.get("/posts", requireAdmin, async (_req, res, next) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate<{ author: { email: string; displayName: string } | null }>(
        "author",
        "email displayName"
      )
      .lean();
    res.json({
      posts: posts.map((post) => ({
        id: post._id,
        title: post.title,
        body: post.body,
        type: post.type,
        status: post.status,
        voteCount: post.voteCount,
        authorEmail: post.author?.email ?? "unknown",
        authorName: post.author?.displayName ?? "unknown",
        createdAt: post.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Board analytics for the moderation dashboard. Everything is one cheap
 * aggregation pass per collection — no per-request vote counting, the stored
 * voteCount already carries it.
 */
router.get("/stats", requireAdmin, async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);

    const [statusRows, typeRows, dailyRows, topRows, postCount, userCount] = await Promise.all([
      Post.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Post.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 }, votes: { $sum: "$voteCount" } } },
      ]),
      Post.aggregate([
        { $match: { createdAt: { $gte: since } } },
        // $dateToString rather than $dateTrunc: mongo:4.4 has no $dateTrunc.
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      Post.find().sort({ voteCount: -1 }).limit(5).select("title voteCount status").lean(),
      Post.countDocuments(),
      User.countDocuments(),
    ]);

    // Zero-fill the window so the chart shows quiet days as gaps, not holes.
    const counts = new Map(dailyRows.map((row) => [row._id as string, row.count as number]));
    const daily: Array<{ date: string; posts: number }> = [];
    for (let offset = 13; offset >= 0; offset--) {
      const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      daily.push({ date: key, posts: counts.get(key) ?? 0 });
    }

    res.json({
      totals: {
        posts: postCount,
        votes: typeRows.reduce((sum, row) => sum + (row.votes as number), 0),
        users: userCount,
      },
      byStatus: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
      byType: Object.fromEntries(typeRows.map((row) => [row._id, row.count])),
      daily,
      top: topRows.map((post) => ({
        id: post._id,
        title: post.title,
        voteCount: post.voteCount,
        status: post.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const patchPost = z.object({
  status: z.enum(POST_STATUSES).optional(),
  title: z.string().trim().min(5).max(120).optional(),
});

router.patch("/posts/:id", requireAdmin, validate(patchPost), async (req, res, next) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!post) throw new HttpError(404, "Post not found.");
    res.json({ id: post._id, status: post.status });
  } catch (err) {
    next(err);
  }
});

router.delete("/posts/:id", requireAdmin, async (req, res, next) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) throw new HttpError(404, "Post not found.");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
