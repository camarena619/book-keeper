import { PERIODS_PER_YEAR } from "./schemas/employee";

// FICA rates are fixed by law.
export const SS_RATE = 0.062; // Social Security, employee & employer each
export const MEDICARE_RATE = 0.0145; // Medicare, employee & employer each
// Annual Social Security wage base — adjust each year (2026 estimate).
export const SS_WAGE_BASE_CENTS = 18_180_000; // $181,800

export interface PayInput {
  pay_type: "salary" | "hourly";
  /** Salary: annual amount in cents. Hourly: per-hour rate in cents. */
  pay_rate_cents: number;
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  federal_withholding_bp: number;
  state_withholding_bp: number;
  /** Hours worked this period (hourly only). */
  hours?: number;
  /** Social-Security-taxable wages already paid this year (for the wage-base cap). */
  ytd_ss_wages_cents?: number;
  /** Optional post-tax deductions (benefits, garnishments, etc.). */
  other_deductions_cents?: number;
}

export interface PayResult {
  gross_cents: number;
  federal_tax_cents: number;
  state_tax_cents: number;
  social_security_cents: number;
  medicare_cents: number;
  other_deductions_cents: number;
  net_cents: number;
  employer_ss_cents: number;
  employer_medicare_cents: number;
}

/**
 * Compute one employee's paycheck for a single pay period.
 *
 * FICA is exact (SS capped at the annual wage base using YTD wages; Medicare
 * flat — the +0.9% high-earner surtax is intentionally not modeled). Federal and
 * state income tax use the employee's configured withholding percentage, an
 * estimate rather than the IRS Pub 15-T tables. Pure function: safe on client
 * (live preview) and server (authoritative posting).
 */
export function computePay(e: PayInput): PayResult {
  const gross =
    e.pay_type === "salary"
      ? Math.round(e.pay_rate_cents / PERIODS_PER_YEAR[e.pay_frequency])
      : Math.round(e.pay_rate_cents * (e.hours ?? 0));

  const ssRemaining = Math.max(0, SS_WAGE_BASE_CENTS - (e.ytd_ss_wages_cents ?? 0));
  const ssTaxable = Math.min(gross, ssRemaining);
  const social_security = Math.round(ssTaxable * SS_RATE);
  const medicare = Math.round(gross * MEDICARE_RATE);

  const federal_tax = Math.round((gross * e.federal_withholding_bp) / 10000);
  const state_tax = Math.round((gross * e.state_withholding_bp) / 10000);
  const other = e.other_deductions_cents ?? 0;

  const net = Math.max(
    0,
    gross - federal_tax - state_tax - social_security - medicare - other,
  );

  return {
    gross_cents: gross,
    federal_tax_cents: federal_tax,
    state_tax_cents: state_tax,
    social_security_cents: social_security,
    medicare_cents: medicare,
    other_deductions_cents: other,
    net_cents: net,
    employer_ss_cents: social_security, // employer matches employee
    employer_medicare_cents: medicare,
  };
}
