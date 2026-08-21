import { Router } from "express";
import { z } from "zod";
import { config, POST_STATUSES, POST_TYPES } from "../config.js";
import { HttpError, validate } from "../middleware/error.js";
import { requireUser, type AuthedRequest } from "../middleware/auth.js";
import { Post } from "../models/Post.js";
import { Vote } from "../models/Vote.js";

const router = Router();

const listQuery = z.object({
  sort: z.enum(["top", "new"]).default("top"),
  status: z.enum([...POST_STATUSES, "all"]).default("all"),
  type: z.enum([...POST_TYPES, "all"]).default("all"),
});

router.get("/", async (req, res, next) => {
  try {
    // Parsed here rather than trusted off req.query: absent params must fall
    // back to the schema's defaults, not leak through as undefined filters.
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "Invalid query.");
    const { sort, status, type } = parsed.data;
    const filter = {
      ...(status !== "all" ? { status } : {}),
      ...(type !== "all" ? { type } : {}),
    };
    // Closed work sinks below everything that is still actionable.
    const order: [string, 1 | -1][] =
      sort === "new"
        ? [["createdAt", -1]]
        : [["status", -1], ["voteCount", -1], ["createdAt", -1]];

    const posts = await Post.find(filter)
      .sort(order)
      .limit(200)
      .populate<{ author: { displayName: string } | null }>("author", "displayName")
      .lean();

    let votedIds: Set<string> = new Set();
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      // The list stays public; the token only personalises it. An invalid or
      // stale token should not blank the board for the person holding it.
      try {
        const { default: jwt } = await import("jsonwebtoken");
        const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub?: string };
        if (payload.sub) {
          const votes = await Vote.find({ user: payload.sub }).lean();
          votedIds = new Set(votes.map((vote) => String(vote.post)));
        }
      } catch {
        /* treated as signed out */
      }
    }

    res.json({
      posts: posts.map((post) => ({
        id: post._id,
        title: post.title,
        body: post.body,
        type: post.type,
        status: post.status,
        voteCount: post.voteCount,
        author: post.author?.displayName ?? "unknown",
        createdAt: post.createdAt,
        voted: votedIds.has(String(post._id)),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const createPost = z.object({
  title: z.string().trim().min(5).max(120),
  body: z.string().trim().min(10).max(4000),
  type: z.enum(POST_TYPES).default("feature"),
});

router.post("/", requireUser, validate(createPost), async (req: AuthedRequest, res, next) => {
  try {
    const post = await Post.create({ ...req.body, author: req.user!.id });
    res.status(201).json({ id: post._id });
  } catch (err) {
    next(err);
  }
});

/** Toggles the caller's vote and keeps the denormalised count honest. */
router.post("/:id/vote", requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const postId = req.params.id;
    if (!/^[0-9a-f]{24}$/i.test(postId)) throw new HttpError(400, "Invalid post id.");
    if (!(await Post.exists({ _id: postId }))) throw new HttpError(404, "Post not found.");

    const removed = await Vote.findOneAndDelete({ post: postId, user: req.user!.id });
    const delta = removed ? -1 : 1;
    if (!removed) await Vote.create({ post: postId, user: req.user!.id });

    const post = await Post.findByIdAndUpdate(
      postId,
      { $inc: { voteCount: delta } },
      { new: true }
    );
    res.json({ voted: !removed, voteCount: post?.voteCount ?? 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
