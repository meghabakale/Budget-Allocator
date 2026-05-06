/**
 * Indian Rupee currency formatting utilities.
 * Always format in the display layer — store only raw numbers in DB.
 */

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Full Indian format: 100000 → ₹1,00,000 */
export function formatCurrency(amount: number): string {
  return INR_FORMATTER.format(amount);
}

/** Short format for chart labels and compact displays */
export function fmtShort(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return formatCurrency(amount);
}

/** For chart axis ticks (very compact) */
export function fmtAxis(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(0)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(0)}L`;
  return `₹${(amount / 1_000).toFixed(0)}K`;
}
