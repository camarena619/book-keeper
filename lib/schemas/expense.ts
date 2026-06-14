import { z } from "zod";

// Mirrors the CHECK constraint on public.expenses.category
export const EXPENSE_CATEGORIES = [
  "materials",
  "rent",
  "utilities",
  "software",
  "tax",
  "travel",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ExpenseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive("Must be greater than 0").max(100_000_000),
  expense_date: z.string().min(1, "Date is required"),
});

export type ExpenseInput = z.infer<typeof ExpenseSchema>;
