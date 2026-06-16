import { z } from "zod";

/** A contractor is a supplier flagged is_1099 with W-9 details. */
export const ContractorSchema = z.object({
  supplier_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name required").max(200),
  legal_name: z.string().trim().max(200).optional().or(z.literal("")),
  // SSN or EIN from the contractor's W-9. Stored encrypted server-side.
  tax_id: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});
export type ContractorInput = z.infer<typeof ContractorSchema>;

/** Payer (your business) tax info that appears on the 1099. */
export const PayerInfoSchema = z.object({
  ein: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});
export type PayerInfoInput = z.infer<typeof PayerInfoSchema>;
