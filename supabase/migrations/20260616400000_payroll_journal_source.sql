-- Allow payroll journal entries to be tagged so they can be rebuilt/filtered,
-- alongside invoice/expense/manual entries.
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_source_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_source_check
  CHECK (reference_source IN ('invoice', 'expense', 'manual', 'payroll'));
