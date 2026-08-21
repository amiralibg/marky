import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError, type ZodSchema } from "zod";

/**
 * Boundary validation: every route declares a zod schema and nothing past this
 * point trusts the request body.
 */
export function validate(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    if (source === "body") req.body = result.data;
    next();
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: first
        ? `${first.path.join(".") || "input"}: ${first.message}`
        : "Invalid input.",
    });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: Object.values(err.errors)[0]?.message ?? "Invalid input." });
    return;
  }
  if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
    res.status(409).json({ error: "Already exists." });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
}
