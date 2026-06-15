import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/schemas/expense";

/**
 * Claude-assisted expense categorization. Server-only: ANTHROPIC_API_KEY never
 * reaches the browser. Degrades gracefully (returns null) when unconfigured.
 *
 * Model: claude-sonnet-4-6 — chosen per the project spec (CLAUDE.md) for the
 * in-app AI features. Uses structured outputs (output_config.format) with a raw
 * JSON schema so we don't couple to a specific Zod major version, then validates
 * the category against the allowed enum defensively.
 */

export const AI_CONFIGURED = Boolean(process.env.ANTHROPIC_API_KEY);

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export interface CategorySuggestion {
  category: ExpenseCategory;
  confidence: number;
}

export async function categorizeTransaction(
  description: string,
  amountCents: number,
): Promise<CategorySuggestion | null> {
  const client = getClient();
  if (!client) return null;

  const dollars = (amountCents / 100).toFixed(2);
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
            confidence: { type: "number" },
          },
          required: ["category", "confidence"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content:
          `Categorize this small-business expense into exactly one of the allowed categories.\n` +
          `Description: "${description}"\n` +
          `Amount: $${dollars}\n` +
          `Allowed categories: ${EXPENSE_CATEGORIES.join(", ")}.\n` +
          `Pick the single best category and give your confidence from 0 to 1.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let parsed: { category?: string; confidence?: number };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return null;
  }

  const category = EXPENSE_CATEGORIES.find((c) => c === parsed.category);
  if (!category) return null;

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

  return { category, confidence };
}
