import mongoose from "mongoose";

// One row per (user, post): the compound unique index makes double-voting
// impossible at the storage layer, not just the handler.
const voteSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

voteSchema.index({ post: 1, user: 1 }, { unique: true });

export const Vote = mongoose.model("Vote", voteSchema);
