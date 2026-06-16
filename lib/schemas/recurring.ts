import { z } from "zod";
import { InvoiceItemSchema } from "./invoice";

export const FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const RecurringInvoiceSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  frequency: z.enum(FREQUENCIES),
  tax_rate_basis_points: z.coerce.number().int().min(0).max(10000),
  // Days after each generation that the invoice is due.
  due_days: z.coerce.number().int().min(0).max(365),
  // false -> generated invoices land as draft; true -> created as 'sent'.
  auto_send: z.coerce.boolean().default(false),
  next_run_date: z.string().min(1, "Start date required"),
  end_date: z.string().optional().or(z.literal("")),
  items: z.array(InvoiceItemSchema).min(1, "Add at least one line item"),
});

export type RecurringInvoiceInput = z.infer<typeof RecurringInvoiceSchema>;
