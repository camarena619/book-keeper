import { z } from "zod";
import { InvoiceItemSchema } from "./invoice";

export const EstimateSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  quote_number: z.string().trim().min(1, "Estimate number required").max(50),
  valid_until: z.string().optional().or(z.literal("")),
  tax_rate_basis_points: z.coerce.number().int().min(0).max(10000),
  items: z.array(InvoiceItemSchema).min(1, "Add at least one line item"),
});

export type EstimateInput = z.infer<typeof EstimateSchema>;
