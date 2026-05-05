import mongoose, { Schema, type Document } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "finance_manager" | "location_admin" | "department_head" | "admin";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
  location: string;
  adminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["finance_manager", "location_admin", "department_head", "admin"],
      default: "department_head",
    },
    department: { type: String, default: "" },
    location: { type: String, default: "" },
    adminId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
