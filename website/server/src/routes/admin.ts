import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config, POST_STATUSES } from "../config.js";
import { HttpError, validate } from "../middleware/error.js";
import { requireAdmin, signAdminToken } from "../middleware/auth.js";
import { Post } from "../models/Post.js";

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
