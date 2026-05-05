import mongoose, { Schema, type Document } from "mongoose";

export interface INegotiationMessage extends Document {
  _id: mongoose.Types.ObjectId;
  requestId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: Date;
}

const NegotiationMessageSchema = new Schema<INegotiationMessage>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: "BudgetRequest", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<INegotiationMessage>("NegotiationMessage", NegotiationMessageSchema);
