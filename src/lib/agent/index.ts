/**
 * FirmScope Deep Agent assembly.
 *
 * Uses LangChain's `deepagents` harness, which supplies the pieces that
 * separate an agent from a chat loop:
 *   - a planning tool (write_todos) so the run has an explicit, visible plan
 *   - a virtual filesystem the agent can use for intermediate notes
 *   - a `task` tool for delegating to subagents with their own prompt,
 *     tool subset, and isolated context window
 *
 * On top of that we add the domain layer: eight custom tools, a legal-SEO
 * playbook, and two subagents.
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult } from "@langchain/core/outputs";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createDeepAgent } from "deepagents";
import { RateLimiter, withRateLimitRetry } from "./throttle";
import {
  CONTENT_STRATEGIST_PROMPT,
  mainSystemPrompt,
  OUTREACH_WRITER_PROMPT,
} from "./prompts";
import { createTools, type RunContext } from "./tools";

/**
 * Gemini is the deliberate choice here: the free tier makes the deployed demo
 * openly testable by the reviewer without me shipping a paid key. The tradeoff
 * is rate limits (10-15 req/min) and weaker long-horizon reasoning than a
 * frontier model, which is exactly why the harness pushes all measurement into
 * deterministic tools and keeps the run to roughly a dozen model turns.
 */
/**
 * Gemini with free-tier pacing built in.
 *
 * Every model call in a run — main agent and subagents alike — passes through
 * one shared bucket, because the quota is per-key, not per-agent. Subclassing
 * is the only hook that covers both `_generate` and streaming without
 * threading a limiter through every call site.
 */
class ThrottledChatGemini extends ChatGoogleGenerativeAI {
  private limiter: RateLimiter;
  private retries: number;

  constructor(fields: ConstructorParameters<typeof ChatGoogleGenerativeAI>[0] & {
    limiter: RateLimiter;
    retries: number;
  }) {
    const { limiter, retries, ...rest } = fields;
    super(rest);
    this.limiter = limiter;
    this.retries = retries;
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    return withRateLimitRetry(async () => {
      await this.limiter.acquire();
      return super._generate(messages, options, runManager);
    }, this.retries);
  }
}

export function buildModel(temperature = 0.3) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add a Gemini API key from https://aistudio.google.com/apikey to .env.local (or your Vercel project settings).",
    );
  }

  const rpm = Number(process.env.GEMINI_REQUESTS_PER_MINUTE) || 8;
  const limiter = new RateLimiter(rpm, 3);

  return new ThrottledChatGemini({
    limiter,
    retries: 4,
    apiKey,
    // Two deliberate choices here.
    //
    // Alias, not a pinned version: pinned models get retired. gemini-2.5-flash
    // already returns "no longer available to new users" for freshly created
    // keys, which silently breaks the demo for anyone setting it up later.
    //
    // Lite, not full Flash: the free tier bills *per model per day*, and full
    // Flash allows only 20 requests/day — less than a single teardown. The
    // lite alias has a far higher daily ceiling. The quality cost is small
    // here precisely because the harness does not ask the model to measure
    // anything; it orchestrates tools and writes prose.
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    temperature,
    maxRetries: 3,
  });
}

export function createFirmScopeAgent(ctx: RunContext) {
  const model = buildModel();
  const tools = createTools(ctx);

  return createDeepAgent({
    model,
    tools: tools.all,
    systemPrompt: mainSystemPrompt({
      firmUrl: ctx.firmUrl,
      city: ctx.city,
      practiceArea: ctx.practiceArea,
    }),
    subagents: [
      {
        name: "content-strategist",
        description:
          "Reads the firm's actual practice-area pages and attorney bios and judges whether the copy is genuinely specific to the jurisdiction or generic filler, whether the architecture matches how people search, and whether bios establish real credentials. Also flags attorney-advertising compliance risks. Delegate to this after the diagnostic tools have run, passing the crawl inventory.",
        systemPrompt: CONTENT_STRATEGIST_PROMPT,
        tools: tools.forContentStrategist,
      },
      {
        name: "outreach-writer",
        description:
          "Writes the single cold email to the firm's managing partner. Delegate to this near the end, passing the sharpest finding with its exact numbers, plus the firm name and city. Returns a subject line and a body under 120 words.",
        systemPrompt: OUTREACH_WRITER_PROMPT,
        tools: tools.forOutreachWriter,
      },
    ],
  });
}

/**
 * Guardrail so a stuck run cannot spin forever on a serverless function.
 *
 * 60 rather than 40: a normal run is ~20 graph steps, but both subagent
 * delegations consume parent steps on top of their own loops, and an
 * occasional model retry pushed a legitimate run past 40. The limit exists to
 * catch a runaway loop, not to cut short a run that is still making progress.
 */
export const RECURSION_LIMIT = 60;
