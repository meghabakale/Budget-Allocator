import mongoose from "mongoose";
import { logger } from "../lib/logger.js";

export async function connectDatabase(): Promise<void> {
  const uri = process.env["MONGODB_URI"] || "mongodb://localhost:27017/budget-db";
  try {
    await mongoose.connect(uri);
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error({ err }, "MongoDB connection failed");
    process.exit(1);
  }
}
