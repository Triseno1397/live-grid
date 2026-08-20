import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic client, plus the knobs the chat route runs on.
 *
 * `import "server-only"` at the top for the same reason src/lib/supabase/admin.ts has it:
 * this module holds a secret, and importing it from a client component should be a build
 * error rather than a leak.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. The expert assistant is disabled until it is configured.`,
    );
  }
  return value;
}

/** Throws rather than returning a half-configured client — the route turns this into a 503. */
export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: required("ANTHROPIC_API_KEY") });
}

export function isConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.trim() !== "");
}

export const CHAT_MODEL = "claude-opus-5";

/**
 * Thinking stays ON deliberately.
 *
 * On Opus 5 with tools, `thinking: { type: "disabled" }` can emit a tool call as visible text
 * instead of a tool_use block — the turn succeeds, the call never runs, and nothing errors.
 * In a loop that silently poisons later turns. Terseness is bought with `effort` and the
 * system prompt instead, which is cheaper anyway.
 */
export const CHAT_EFFORT = "medium" as const;

export const LIMITS = {
  /** Per response. Answers are meant to be short; this is a ceiling, not a target. */
  maxTokens: 4096,
  /** Tool round trips within one turn before we stop and answer with what we have. */
  maxToolIterations: 8,
  /** Turns of history accepted from the client. Older turns are dropped from the front. */
  maxHistoryTurns: 24,
  /** Messages per IP per UTC day. */
  dailyPerIp: Number(process.env.CHAT_DAILY_LIMIT ?? 40),
} as const;
