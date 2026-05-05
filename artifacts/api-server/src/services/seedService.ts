import User from "../models/User.js";
import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import AdminAllocation from "../models/AdminAllocation.js";
import { logger } from "../lib/logger.js";

const LOCATIONS = [
  { name: "Bangalore", username: "blr_admin", email: "blr@budgetapp.com", priorityScore: 9, performanceScore: 0.85 },
  { name: "Pune",      username: "pune_admin", email: "pune@budgetapp.com", priorityScore: 8, performanceScore: 0.78 },
  { name: "Delhi",     username: "delhi_admin", email: "delhi@budgetapp.com", priorityScore: 7, performanceScore: 0.72 },
  { name: "Chennai",   username: "chennai_admin", email: "chennai@budgetapp.com", priorityScore: 6, performanceScore: 0.65 },
];

const DEPT_HEADS = [
  { dept: "Engineering",  location: "Bangalore", username: "blr_eng",    email: "blr.eng@budgetapp.com",  amt: 300000, priority: "High",   just: "Cloud infra + AI tooling upgrade" },
  { dept: "Product",      location: "Bangalore", username: "blr_prod",   email: "blr.prod@budgetapp.com", amt: 150000, priority: "High",   just: "Product roadmap tooling and research" },
  { dept: "Engineering",  location: "Pune",      username: "pune_eng",   email: "pune.eng@budgetapp.com", amt: 200000, priority: "High",   just: "Development infrastructure scaling" },
  { dept: "Operations",   location: "Pune",      username: "pune_ops",   email: "pune.ops@budgetapp.com", amt: 120000, priority: "Medium", just: "Facility upgrades and equipment" },
  { dept: "Marketing",    location: "Delhi",     username: "delhi_mkt",  email: "delhi.mkt@budgetapp.com",amt: 180000, priority: "Medium", just: "National marketing campaign Q4" },
  { dept: "Sales",        location: "Delhi",     username: "delhi_sales",email: "delhi.sales@budgetapp.com",amt: 100000,priority: "Medium", just: "Sales team expansion and CRM tools" },
  { dept: "HR",           location: "Chennai",   username: "chennai_hr", email: "chennai.hr@budgetapp.com",amt: 80000, priority: "Low",    just: "Recruitment and training programs" },
  { dept: "Finance",      location: "Chennai",   username: "chennai_fin",email: "chennai.fin@budgetapp.com",amt: 60000, priority: "Low",   just: "Accounting software and compliance" },
];

export async function seedDatabase(): Promise<void> {
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database with multi-admin architecture...");

  // ── Finance Manager (Super Admin) ──────────────────────────────────────────
  await User.create({
    username: "finance_mgr",
    email: "finance@budgetapp.com",
    password: "admin123",
    role: "finance_manager",
    department: "Finance Management",
    location: "",
  });

  // Backward-compat admin
  await User.create({
    username: "admin",
    email: "admin@budgetapp.com",
    password: "admin123",
    role: "admin",
    department: "Administration",
    location: "",
  });

  // ── Location Admins ────────────────────────────────────────────────────────
  const locationAdminUsers = await Promise.all(
    LOCATIONS.map((loc) =>
      User.create({
        username: loc.username,
        email: loc.email,
        password: "admin123",
        role: "location_admin",
        department: `${loc.name} Admin`,
        location: loc.name,
      })
    )
  );

  // ── Department Heads — auto-assigned to location admin ─────────────────────
  const deptUsers = await Promise.all(
    DEPT_HEADS.map((dh) => {
      const locAdmin = locationAdminUsers.find((u) => u.location === dh.location)!;
      return User.create({
        username: dh.username,
        email: dh.email,
        password: "password123",
        role: "department_head",
        department: dh.dept,
        location: dh.location,
        adminId: locAdmin._id,
      });
    })
  );

  // ── Budget Pool ────────────────────────────────────────────────────────────
  await Budget.create({
    totalBudget: 1000000,
    allocatedAmount: 0,
    remainingAmount: 1000000,
    fiscalYear: new Date().getFullYear().toString(),
  });

  // ── Admin Allocations (seeded with weighted scores; actual distribution runs on first recalc) ──
  await Promise.all(
    LOCATIONS.map((loc, i) =>
      AdminAllocation.create({
        adminId: locationAdminUsers[i]._id,
        adminName: `${loc.name} Admin`,
        adminUsername: loc.username,
        location: loc.name,
        totalDemand: 0,
        allocatedBudget: 0,
        usedBudget: 0,
        remainingBudget: 0,
        priorityScore: loc.priorityScore,
        performanceScore: loc.performanceScore,
        demandScore: 0,
        allocationScore: 0,
      })
    )
  );

  // ── Sample Budget Requests ─────────────────────────────────────────────────
  await Promise.all(
    DEPT_HEADS.map((dh, i) => {
      const user = deptUsers[i];
      return BudgetRequest.create({
        departmentId: `${dh.location.toLowerCase()}_${dh.dept.toLowerCase()}`,
        departmentName: `${dh.dept} (${dh.location})`,
        requestedBy: user._id,
        requestedAmount: dh.amt,
        priorityLevel: dh.priority,
        justification: dh.just,
        status: "pending",
        allocatedAmount: 0,
        version: 1,
        location: dh.location,
      });
    })
  );

  logger.info("Multi-admin database seeded successfully");
  logger.info("Finance Manager: finance_mgr / admin123");
  logger.info("Location Admins: blr_admin, pune_admin, delhi_admin, chennai_admin / admin123");
  logger.info("Dept Heads: blr_eng, pune_eng, delhi_mkt, chennai_hr ... / password123");
}
