/**
 * Formatting and helper utilities for Sunset Group Dashboard.
 */

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format number as Bangladeshi Taka (BDT) currency.
 */
export function formatBDT(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "৳ 0";
  }
  const hasDecimals = Math.abs(amount) < 100 && amount % 1 !== 0;
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  })
    .format(amount)
    .replace("BDT", "৳");
}

/**
 * Format minutes into "Xh Ym" or "Ym".
 */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes <= 0) {
    return "0m";
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Return today's date formatted as YYYY-MM-DD in Asia/Dhaka timezone.
 */
export function getDhakaToday(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Return date offset by N days in Asia/Dhaka timezone (e.g. -30 for 30 days ago).
 */
export function getDhakaDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Format a YYYY-MM-DD date string to a human readable format: "Thursday, 22 Oct 2026"
 */
export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Format numeric user ID into standardized year-based numeric employee code (e.g. 2026001, 2026006, 2027001).
 * Only numbers, automatically incorporates the employee creation year or current year.
 */
export function formatEmployeeId(
  id: number | null | undefined,
  createdAtOrYear?: string | Date | number | null
): string {
  if (!id || id <= 0) return "";

  // If already a full year-based numeric ID (e.g. 2026001, 2027005)
  if (id >= 2000000) {
    return String(id);
  }

  // Determine year: from createdAtOrYear, or fallback to current calendar year
  let year: number;
  if (typeof createdAtOrYear === "number") {
    year = createdAtOrYear >= 2000 ? createdAtOrYear : new Date().getFullYear();
  } else if (createdAtOrYear) {
    const parsed = new Date(createdAtOrYear);
    const parsedYear = parsed.getFullYear();
    year = !isNaN(parsedYear) && parsedYear >= 2000 ? parsedYear : new Date().getFullYear();
  } else {
    year = new Date().getFullYear();
  }

  return `${year}${String(id).padStart(3, "0")}`;
}

