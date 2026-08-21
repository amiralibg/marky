import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  mongodbUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  adminJwtSecret: required("ADMIN_JWT_SECRET"),
  adminEmail: required("ADMIN_EMAIL").toLowerCase(),
  adminPassword: required("ADMIN_PASSWORD"),
};

export const POST_STATUSES = ["open", "planned", "in-progress", "done", "closed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_TYPES = ["feature", "bug"] as const;
export type PostType = (typeof POST_TYPES)[number];
