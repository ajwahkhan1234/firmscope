/**
 * POST /api/teardown — run a teardown and stream the agent's work as SSE.
 *
 * Why streaming: a full teardown takes 40-120s. Without a live timeline the
 * user stares at a spinner and assumes it hung. Streaming the agent's plan and
 * every tool call also makes the harness legible — you can watch it decide,
 * measure, delegate, and score, which is the whole point of the product.
 *
 * Persistence is best-effort and never blocks the run: if Supabase is
 * misconfigured the user still gets their teardown, they just lose history.
 */

import { NextRequest } from "next/server";
import { normalizeUrl } from "@/lib/agent/url";
import type { EmitKind } from "@/lib/agent/tools";
import {
  completeTeardownRow,
  createTeardownRow,
  failTeardownRow,
  recordEvent,
} from "@/lib/supabase/server";

/**
 * The agent module graph (deepagents, LangChain, cheerio) is imported lazily
 * inside the request handler rather than at module scope. A module-scope
 * failure here is uncatchable — Next returns a bare HTTP 500 with no body, and
 * the UI can only say "something went wrong". Loading it inside the try turns
 * the same failure into a message that names the missing module.
 */
async function loadAgent() {
  const [{ createFirmScopeAgent, RECURSION_LIMIT }, { createRunContext }] =
    await Promise.all([import("@/lib/agent"), import("@/lib/agent/tools")]);
  return { createFirmScopeAgent, RECURSION_LIMIT, createRunContext };
}

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface TeardownRequest {
  url?: string;
  city?: string;
  practiceArea?: string;
}

export async function POST(req: NextRequest) {
  let body: TeardownRequest;
  try {
    body = (await req.json()) as TeardownRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.url?.trim()) {
    return Response.json({ error: "A firm website URL is required." }, { status: 400 });
  }

  let firmUrl: string;
  try {
    firmUrl = normalizeUrl(body.url);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid URL." },
      { status: 400 },
    );
  }

  if (!process.env.GOOGLE_API_KEY) {
    return Response.json(
      {
        error:
          "GOOGLE_API_KEY is not configured on the server. Add a Gemini API key from aistudio.google.com/apikey.",
      },
      { status: 503 },
    );
  }

  const city = body.city?.trim() || null;
  const practiceArea = body.practiceArea?.trim() || null;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = 0;
      let closed = false;

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Create the row up front so a run that dies mid-flight still leaves a
      // record we can mark failed. Persistence failures must not abort the
      // run, so this is inside the guard along with everything else.
      let teardownId: string | null = null;

      try {
        teardownId = await createTeardownRow({ firmUrl, city, practiceArea });
      } catch (err) {
        console.error("[teardown] could not create row:", err);
      }

      send({ type: "start", teardownId, firmUrl, city, practiceArea });

      try {
        const { createFirmScopeAgent, RECURSION_LIMIT, createRunContext } =
          await loadAgent();

        const ctx = createRunContext(firmUrl, city, practiceArea, () => {});

        ctx.emit = (kind: EmitKind, label: string, payload?: unknown) => {
          seq += 1;
          send({ type: "event", seq, kind, label, payload });
          if (teardownId) {
            // Fire-and-forget: persistence must never stall the run.
            void recordEvent(teardownId, seq, kind, label, payload).catch(() => {});
          }
        };

        const agent = createFirmScopeAgent(ctx);

        const agentStream = await agent.stream(
          {
            messages: [
              {
                role: "user",
                content: `Run a full FirmScope teardown on ${firmUrl}.${
                  city ? ` The firm's target market is ${city}.` : ""
                }${practiceArea ? ` Their primary practice area is ${practiceArea}.` : ""}`,
              },
            ],
          },
          { streamMode: "updates", recursionLimit: RECURSION_LIMIT },
        );

        let lastAssistantText = "";
        let lastTodosJson = "";

        for await (const chunk of agentStream) {
          if (!chunk || typeof chunk !== "object") continue;

          for (const nodeUpdate of Object.values(chunk as Record<string, unknown>)) {
            if (!nodeUpdate || typeof nodeUpdate !== "object") continue;
            const update = nodeUpdate as Record<string, unknown>;

            // Surface the agent's plan whenever it changes.
            if (Array.isArray(update.todos)) {
              const json = JSON.stringify(update.todos);
              if (json !== lastTodosJson) {
                lastTodosJson = json;
                send({ type: "todos", todos: update.todos });
                if (teardownId) {
                  seq += 1;
                  void recordEvent(teardownId, seq, "plan", "Plan updated", update.todos).catch(
                    () => {},
                  );
                }
              }
            }

            // Capture assistant prose so the run ends with a human summary.
            if (Array.isArray(update.messages)) {
              for (const msg of update.messages) {
                const m = msg as { getType?: () => string; content?: unknown; text?: unknown };
                const type = typeof m.getType === "function" ? m.getType() : undefined;
                if (type !== "ai") continue;
                const text =
                  typeof m.content === "string"
                    ? m.content
                    : typeof m.text === "string"
                      ? m.text
                      : Array.isArray(m.content)
                        ? m.content
                            .map((part) =>
                              part && typeof part === "object" && "text" in part
                                ? String((part as { text: unknown }).text)
                                : "",
                            )
                            .join("")
                        : "";
                if (text.trim()) lastAssistantText = text.trim();
              }
            }
          }
        }

        const durationMs = Date.now() - startedAt;

        if (!ctx.finalTeardown || !ctx.scorecard) {
          throw new Error(
            "The agent finished without saving a teardown. This usually means it hit the step limit or the model stopped early — try again.",
          );
        }

        const teardown = {
          firmUrl,
          firmName: ctx.finalTeardown.firmName,
          city,
          practiceArea,
          scorecard: ctx.scorecard,
          findings: ctx.finalTeardown.findings,
          outreachEmail: ctx.finalTeardown.outreach,
          signals: ctx.signals,
          pagesAnalyzed: ctx.crawl?.pages.length ?? 0,
        };

        if (teardownId) {
          await completeTeardownRow(teardownId, {
            firmName: teardown.firmName,
            scorecard: ctx.scorecard,
            findings: teardown.findings,
            signals: ctx.signals,
            outreach: teardown.outreachEmail,
            pagesAnalyzed: teardown.pagesAnalyzed,
            durationMs,
          });
        }

        send({
          type: "result",
          teardown,
          summary: lastAssistantText,
          durationMs,
          persisted: Boolean(teardownId),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "The teardown failed for an unknown reason.";
        console.error("[teardown] run failed:", err);
        if (teardownId) await failTeardownRow(teardownId, message).catch(() => {});
        send({ type: "error", message: friendlyError(message) });
      } finally {
        send({ type: "end" });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Translate the failure modes users actually hit into plain language. */
function friendlyError(message: string): string {
  if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return `The agent runtime failed to load on the server (${message}). This is a deployment/bundling problem rather than a problem with the firm's site.`;
  }
  if (/429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return "Gemini's free-tier rate limit was hit mid-run. Wait about a minute and try again — the free tier allows a limited number of requests per minute.";
  }
  if (/API key|GOOGLE_API_KEY|API_KEY_INVALID/i.test(message)) {
    return "The Gemini API key is missing or invalid. Check GOOGLE_API_KEY in your environment.";
  }
  if (/Could not fetch/i.test(message)) return message;
  if (/recursion|step limit|GRAPH_RECURSION/i.test(message)) {
    return "The agent hit its step limit before finishing. This usually means the site is unusual enough that it kept re-checking — try again, or try a more specific URL.";
  }
  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(message)) {
    return "The firm's website took too long to respond. It may be slow or blocking automated requests.";
  }
  return message;
}
