import { createHash } from "node:crypto";

import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { CHAT_EFFORT, CHAT_MODEL, LIMITS, createAnthropicClient, isConfigured } from "@/lib/chat/client";
import { SYSTEM_PROMPT } from "@/lib/chat/system";
import { TOOLS, runTool } from "@/lib/chat/tools";
import { createAdminClient } from "@/lib/supabase/admin";

// The Anthropic SDK, node:crypto and the service-role metering client all need Node.
export const runtime = "nodejs";
export const maxDuration = 60;

type ClientMessage = { role: "user" | "assistant"; content: string };

/**
 * Callers are counted, not identified: the address is salted with the admin token (a secret
 * that already exists and never leaves the server) and hashed, so the stored value cannot be
 * reversed into an IP by anyone reading the table.
 */
function hashIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.ADMIN_IMPORT_TOKEN ?? "live-grid";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseMessages(body: unknown): ClientMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const messages: ClientMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.trim() === "") return null;
    // A single pasted document should not become a 200k-token request.
    messages.push({ role, content: content.slice(0, 8000) });
  }

  if (messages.at(-1)?.role !== "user") return null;
  // Trim from the FRONT so the newest turns survive; the system prompt is what carries the
  // expertise, and old turns are the cheapest thing to lose.
  return messages.slice(-LIMITS.maxHistoryTurns);
}

/**
 * POST /api/chat
 *
 * Body: { messages: [{ role, content }] }, oldest first, ending with the user's new message.
 * Streams Server-Sent Events: `text` (a delta), `tool` (a tool name, so the UI can say what it
 * is doing), `done`, `error`.
 *
 * History lives in the client. There are no accounts until Phase 2 and nothing here is
 * persisted, so a conversation leaves no trace beyond the usage counter.
 */
export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set on the server. The expert assistant is disabled until " +
          "it is configured.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const messages = parseMessages(body);
  if (!messages) {
    return NextResponse.json(
      { error: "Expected { messages: [{ role, content }] } ending with a user message." },
      { status: 400 },
    );
  }

  // Metered before any spend. Failing open here would defeat the point of the table.
  try {
    const { data, error } = await createAdminClient().rpc("bump_chat_usage", {
      p_ip_hash: hashIp(request),
    });
    if (error) throw new Error(error.message);
    if (typeof data === "number" && data > LIMITS.dailyPerIp) {
      return NextResponse.json(
        { error: `Daily limit reached (${LIMITS.dailyPerIp} messages). Resets at midnight UTC.` },
        { status: 429 },
      );
    }
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Usage check failed." },
      { status: 500 },
    );
  }

  const client = createAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      // Anthropic's own message list, which accumulates tool_use/tool_result as we loop.
      const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        for (let iteration = 0; iteration < LIMITS.maxToolIterations; iteration += 1) {
          const turn = client.messages.stream({
            model: CHAT_MODEL,
            max_tokens: LIMITS.maxTokens,
            thinking: { type: "adaptive" },
            output_config: { effort: CHAT_EFFORT },
            // One breakpoint on the system prompt. It is ~30k tokens of corpus and is
            // byte-identical every request, so this is the difference between roughly $0.03
            // and $0.31 a turn.
            system: [
              { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
            ],
            tools: TOOLS,
            messages: conversation,
          });

          turn.on("text", (delta) => send("text", { delta }));

          const response = await turn.finalMessage();
          conversation.push({ role: "assistant", content: response.content });

          const toolUses = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );

          if (toolUses.length === 0) {
            send("done", { stopReason: response.stop_reason });
            controller.close();
            return;
          }

          // All tool_results go back in ONE user message. Splitting them across several
          // silently teaches the model to stop calling tools in parallel.
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const use of toolUses) {
            send("tool", { name: use.name });
            try {
              const result = await runTool(use.name, (use.input ?? {}) as Record<string, unknown>);
              results.push({
                type: "tool_result",
                tool_use_id: use.id,
                content: JSON.stringify(result),
              });
            } catch (cause) {
              results.push({
                type: "tool_result",
                tool_use_id: use.id,
                is_error: true,
                content: cause instanceof Error ? cause.message : "Tool failed.",
              });
            }
          }
          conversation.push({ role: "user", content: results });
        }

        // Ran out of iterations with the model still calling tools.
        send("error", { message: "The assistant took too many steps. Try a narrower question." });
        controller.close();
      } catch (cause) {
        send("error", {
          message: cause instanceof Error ? cause.message : "The assistant failed to respond.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
