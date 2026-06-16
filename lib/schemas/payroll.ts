import { z } from "zod";

export const PayRunSchema = z.object({
  period_start: z.string().min(1, "Period start required"),
  period_end: z.string().min(1, "Period end required"),
  pay_date: z.string().min(1, "Pay date required"),
  lines: z
    .array(
      z.object({
        employee_id: z.string().uuid(),
        hours: z.coerce.number().min(0).max(1000).optional(),
      }),
    )
    .min(1, "Select at least one employee"),
});

export type PayRunInput = z.infer<typeof PayRunSchema>;
