import { z } from "zod";

export const PAY_TYPES = ["salary", "hourly"] as const;
export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export const FILING_STATUSES = ["single", "married", "head_of_household"] as const;

export const PAY_FREQUENCY_LABELS: Record<(typeof PAY_FREQUENCIES)[number], string> = {
  weekly: "Weekly (52/yr)",
  biweekly: "Bi-weekly (26/yr)",
  semimonthly: "Semi-monthly (24/yr)",
  monthly: "Monthly (12/yr)",
};
export const FILING_STATUS_LABELS: Record<(typeof FILING_STATUSES)[number], string> = {
  single: "Single",
  married: "Married",
  head_of_household: "Head of household",
};

/** Periods per year for each pay frequency — used to convert annual salary. */
export const PERIODS_PER_YEAR: Record<(typeof PAY_FREQUENCIES)[number], number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export const EmployeeSchema = z.object({
  employee_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name required").max(200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  ssn: z.string().max(40).optional().or(z.literal("")),
  pay_type: z.enum(PAY_TYPES),
  // Dollars: annual salary (salary) or hourly rate (hourly).
  pay_rate: z.coerce.number().min(0).max(100_000_000),
  pay_frequency: z.enum(PAY_FREQUENCIES),
  // Income-tax withholding as a percentage the user controls (estimated).
  federal_withholding_pct: z.coerce.number().min(0).max(100),
  state_withholding_pct: z.coerce.number().min(0).max(100),
  filing_status: z.enum(FILING_STATUSES),
  hire_date: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type EmployeeInput = z.infer<typeof EmployeeSchema>;
