import { z } from "zod";

export const InvoiceItemSchema = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  description: z.string().max(500).optional().or(z.literal("")),
  // Entered in dollars in the UI; converted to cents in the server action.
  amount: z.coerce.number().positive("Must be greater than 0").max(100_000_000),
});

export const InvoiceSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  invoice_number: z.string().trim().min(1, "Invoice number required").max(50),
  due_date: z.string().min(1, "Due date required"),
  tax_rate_basis_points: z.coerce.number().int().min(0).max(10000),
  items: z.array(InvoiceItemSchema).min(1, "Add at least one line item"),
});

export type InvoiceItemInput = z.infer<typeof InvoiceItemSchema>;
export type InvoiceInput = z.infer<typeof InvoiceSchema>;
