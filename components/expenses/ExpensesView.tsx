"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ExpenseSchema,
  EXPENSE_CATEGORIES,
  type ExpenseInput,
  type ExpenseCategory,
} from "@/lib/schemas/expense";
import {
  createExpense,
  approveExpense,
  suggestExpenseCategory,
} from "@/app/dashboard/expenses/actions";

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string;
  status: "pending_review" | "approved";
}

export interface ContractorOption {
  id: string;
  name: string;
}

export function ExpensesView({
  pending,
  approved,
  contractors,
  canEdit,
  aiConfigured,
}: {
  pending: Expense[];
  approved: Expense[];
  contractors: ContractorOption[];
  canEdit: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, startTransition] = useTransition();

  function approve(id: string, category: ExpenseCategory) {
    startTransition(async () => {
      await approveExpense(id, category);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-slate-500">Vendor spend &amp; categorization</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Log Expense
          </button>
        )}
      </header>

      {pending.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/40">
          <h2 className="mb-3 text-lg font-semibold text-warning">
            Review Queue ({pending.length})
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Bank-imported transactions awaiting categorization. Use{" "}
            <span className="font-medium text-brand">Suggest</span> for a
            Claude-assisted category, then Approve to post the journal entry.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 font-medium">Category</th>
                  {canEdit && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {pending.map((e) => (
                  <ReviewRow
                    key={e.id}
                    expense={e}
                    canEdit={canEdit}
                    busy={busy}
                    aiConfigured={aiConfigured}
                    onApprove={approve}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">Approved Expenses</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {approved.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="py-2">{formatDate(e.expense_date)}</td>
                <td className="py-2 font-medium">{e.title}</td>
                <td className="py-2 capitalize text-slate-600">{e.category}</td>
                <td className="py-2 text-right font-mono font-semibold text-danger">
                  {formatCurrency(e.amount_cents)}
                </td>
              </tr>
            ))}
            {approved.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No approved expenses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ExpenseModal
          contractors={contractors}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function ReviewRow({
  expense,
  canEdit,
  busy,
  aiConfigured,
  onApprove,
}: {
  expense: Expense;
  canEdit: boolean;
  busy: boolean;
  aiConfigured: boolean;
  onApprove: (id: string, category: ExpenseCategory) => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [suggesting, setSuggesting] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [aiError, setAiError] = useState("");

  async function suggest() {
    setSuggesting(true);
    setAiError("");
    setConfidence(null);
    const r = await suggestExpenseCategory(expense.title, expense.amount_cents);
    setSuggesting(false);
    if (r.error) {
      setAiError(r.error);
      return;
    }
    if (r.category) {
      setCategory(r.category);
      setConfidence(r.confidence ?? null);
    }
  }

  return (
    <tr className="border-b border-amber-100">
      <td className="py-2">{formatDate(expense.expense_date)}</td>
      <td className="py-2 font-medium">{expense.title}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(expense.amount_cents)}</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-line bg-slate-100 text-slate-900 px-2 py-1 text-xs capitalize outline-none transition focus:border-brand/60 focus:ring-1 focus:ring-brand/15"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            disabled={!canEdit || busy}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {aiConfigured && canEdit && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
              onClick={suggest}
              disabled={busy || suggesting}
              title="Suggest a category with Claude"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? "…" : "Suggest"}
            </button>
          )}
        </div>
        {confidence !== null && (
          <div className="mt-0.5 text-xs text-slate-400">
            AI confidence: {Math.round(confidence * 100)}%
          </div>
        )}
        {aiError && <div className="mt-0.5 text-xs text-danger">{aiError}</div>}
      </td>
      {canEdit && (
        <td className="py-2 text-right">
          <button
            className="rounded px-2 py-1 text-xs font-medium text-success hover:bg-success/15"
            onClick={() => onApprove(expense.id, category)}
            disabled={busy}
          >
            Approve
          </button>
        </td>
      )}
    </tr>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ExpenseModal({
  contractors,
  onClose,
}: {
  contractors: ContractorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(ExpenseSchema),
    defaultValues: {
      title: "",
      category: "materials",
      amount: 0,
      expense_date: todayStr(),
      supplier_id: "",
    },
  });

  async function onSubmit(values: ExpenseInput) {
    setServerError("");
    const result = await createExpense(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="my-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-elev backdrop-blur-xl">
        <h3 className="mb-4 text-lg font-semibold">Log Expense</h3>
        {serverError && (
          <div className="mb-3 alert alert-danger">
            {serverError}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="AWS Cloud Hosting" {...register("title")} />
            {errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input capitalize" {...register("category")}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                className="input font-mono"
                placeholder="0.00"
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount && <p className="mt-1 text-xs text-danger">{errors.amount.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" {...register("expense_date")} />
            {errors.expense_date && (
              <p className="mt-1 text-xs text-danger">{errors.expense_date.message}</p>
            )}
          </div>
          {contractors.length > 0 && (
            <div>
              <label className="label">Contractor (1099) — optional</label>
              <select className="input" {...register("supplier_id")}>
                <option value="">None</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Link this payment to a contractor so it counts toward their 1099-NEC.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Log Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
