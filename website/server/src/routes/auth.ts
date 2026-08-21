import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/error.js";
import { requireUser, signUserToken, type AuthedRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = Router();

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

const register = credentials.extend({
  displayName: z.string().trim().min(2).max(40),
});

/** Public shape — the password hash never leaves the server. */
function toPublic(user: { _id: unknown; email: string; displayName: string }) {
  return { id: user._id, email: user.email, displayName: user.displayName };
}

router.post("/register", validate(register), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body as z.infer<typeof register>;
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    const user = await User.create({
      email,
      displayName,
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json({ token: signUserToken(String(user._id)), user: toPublic(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/login", validate(credentials), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof credentials>;
    // Same generic message for unknown email and wrong password.
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Wrong email or password." });
      return;
    }
    res.json({ token: signUserToken(String(user._id)), user: toPublic(user) });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(401).json({ error: "Session expired. Sign in again." });
      return;
    }
    res.json({ user: toPublic(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
