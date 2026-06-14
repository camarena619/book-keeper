import { z } from "zod";

export const OrgSettingsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  billing_email: z
    .string()
    .email("Invalid email")
    .or(z.literal(""))
    .optional(),
  routing_number: z
    .string()
    .regex(/^\d{9}$/, "Routing number must be 9 digits")
    .or(z.literal(""))
    .optional(),
  account_number: z
    .string()
    .regex(/^\d{4,17}$/, "Account number must be 4–17 digits")
    .or(z.literal(""))
    .optional(),
});

export type OrgSettingsInput = z.infer<typeof OrgSettingsSchema>;
