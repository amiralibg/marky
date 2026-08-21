import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User } from "../models/User.js";

export interface AuthedRequest extends Request {
  user?: { id: string };
}

export function signUserToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "30d" });
}

/** Rejects with 401 unless a valid bearer token names a real user. */
export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Sign in to do that." });
      return;
    }
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub?: string };
    if (!payload.sub || !(await User.exists({ _id: payload.sub }))) {
      res.status(401).json({ error: "Session expired. Sign in again." });
      return;
    }
    req.user = { id: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Sign in again." });
  }
}

export function signAdminToken(): string {
  return jwt.sign({ role: "admin" }, config.adminJwtSecret, { expiresIn: "12h" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.adminJwtSecret) as { role?: string };
    if (payload.role !== "admin") throw new Error("wrong role");
    next();
  } catch {
    res.status(401).json({ error: "Admin session expired. Sign in again." });
  }
}
