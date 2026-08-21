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
    // "Most voted" has to actually lead with votes. It used to sort on `status`
    // first, which mongo orders lexically — so every "planned" idea outranked a
    // 50-vote "open" one purely on the letter p.
    const order: [string, 1 | -1][] =
      sort === "new"
        ? [["createdAt", -1]]
        : [["voteCount", -1], ["createdAt", -1]];

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

    // Closed work sinks below everything still actionable. Done in memory
    // rather than in the sort, so it reorders the top 200 by vote without
    // distorting which 200 those are.
    const ranked = posts
      .map((post, index) => ({ post, index, closed: post.status === "closed" ? 1 : 0 }))
      .sort((a, b) => a.closed - b.closed || a.index - b.index)
      .map((entry) => entry.post);

    res.json({
      posts: ranked.map((post) => ({
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
    let delta = removed ? -1 : 1;
    if (!removed) {
      try {
        await Vote.create({ post: postId, user: req.user!.id });
      } catch (err) {
        // Duplicate key: a double-tap raced us and the vote already exists.
        // The caller's intent is satisfied, so report success without
        // incrementing a second time.
        if (!(typeof err === "object" && err !== null && "code" in err && err.code === 11000)) {
          throw err;
        }
        delta = 0;
      }
    }

    // Pipeline update rather than $inc so a lost race can never drive the
    // denormalised count below zero. Schema validators do not run on
    // findByIdAndUpdate, so min: 0 would not have caught it.
    const post = await Post.findByIdAndUpdate(
      postId,
      [{ $set: { voteCount: { $max: [0, { $add: ["$voteCount", delta] }] } } }],
      { new: true }
    );
    res.json({ voted: !removed, voteCount: post?.voteCount ?? 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
