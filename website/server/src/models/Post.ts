import mongoose from "mongoose";
import type { PostStatus, PostType } from "../config.js";

export interface IPost extends mongoose.Document {
  author: mongoose.Types.ObjectId;
  title: string;
  body: string;
  type: PostType;
  status: PostStatus;
  voteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxLength: 120 },
    body: { type: String, required: true, trim: true, maxLength: 4000 },
    type: { type: String, enum: ["feature", "bug"], default: "feature" },
    status: {
      type: String,
      enum: ["open", "planned", "in-progress", "done", "closed"],
      default: "open",
    },
    // Kept on the post so the board sorts without counting votes per row.
    voteCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

postSchema.index({ status: 1, voteCount: -1 });
postSchema.index({ createdAt: -1 });

export const Post = mongoose.model<IPost>("Post", postSchema);
