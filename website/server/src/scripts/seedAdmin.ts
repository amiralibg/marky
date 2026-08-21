import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "../config.js";
import { User } from "../models/User.js";

/**
 * Creates or refreshes a user account with ADMIN_EMAIL/ADMIN_PASSWORD so the
 * same credentials sign in as admin on /admin. Run: npm run seed:admin
 */
async function seed() {
  await mongoose.connect(config.mongodbUri);
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const existing = await User.findOneAndUpdate(
    { email: config.adminEmail },
    { $set: { passwordHash, displayName: "Amirali" } },
    { upsert: true, new: true }
  );
  console.log(`Admin account ready: ${existing.email}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
