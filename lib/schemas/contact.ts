import { z } from "zod";

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .email("Invalid email address")
    .or(z.literal(""))
    .optional(),
  phone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof ContactSchema>;
