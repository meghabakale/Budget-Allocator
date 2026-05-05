import User from "../models/User.js";
import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import { logger } from "../lib/logger.js";

export async function seedDatabase(): Promise<void> {
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database...");

  const admin = await User.create({
    username: "admin",
    email: "admin@budgetapp.com",
    password: "admin123",
    role: "admin",
    department: "Administration",
  });

  const departments = [
    { name: "Engineering", username: "eng_head", email: "eng@budgetapp.com" },
    { name: "Marketing", username: "mkt_head", email: "mkt@budgetapp.com" },
    { name: "Operations", username: "ops_head", email: "ops@budgetapp.com" },
    { name: "HR", username: "hr_head", email: "hr@budgetapp.com" },
  ];

  const deptUsers = await Promise.all(
    departments.map((d) =>
      User.create({
        username: d.username,
        email: d.email,
        password: "password123",
        role: "department_head",
        department: d.name,
      })
    )
  );

  const budget = await Budget.create({
    totalBudget: 1000000,
    allocatedAmount: 0,
    remainingAmount: 1000000,
    fiscalYear: new Date().getFullYear().toString(),
  });

  await BudgetRequest.create([
    {
      departmentId: "engineering",
      departmentName: "Engineering",
      requestedBy: deptUsers[0]._id,
      requestedAmount: 250000,
      priorityLevel: "High",
      justification: "New development tools and infrastructure upgrade",
      status: "approved",
      allocatedAmount: 250000,
      version: 1,
    },
    {
      departmentId: "marketing",
      departmentName: "Marketing",
      requestedBy: deptUsers[1]._id,
      requestedAmount: 150000,
      priorityLevel: "Medium",
      justification: "Q4 marketing campaign and brand awareness",
      status: "pending",
      allocatedAmount: 0,
      version: 1,
    },
    {
      departmentId: "operations",
      departmentName: "Operations",
      requestedBy: deptUsers[2]._id,
      requestedAmount: 180000,
      priorityLevel: "High",
      justification: "Equipment maintenance and facility upgrades",
      status: "under_negotiation",
      allocatedAmount: 0,
      version: 1,
    },
    {
      departmentId: "hr",
      departmentName: "HR",
      requestedBy: deptUsers[3]._id,
      requestedAmount: 80000,
      priorityLevel: "Low",
      justification: "Training programs and recruitment costs",
      status: "conflicted",
      allocatedAmount: 0,
      version: 1,
    },
  ]);

  budget.allocatedAmount = 250000;
  budget.remainingAmount = 750000;
  await budget.save();

  logger.info({ adminId: admin._id }, "Database seeded successfully");
  logger.info("Demo credentials: admin/admin123, eng_head/password123, mkt_head/password123");
}
