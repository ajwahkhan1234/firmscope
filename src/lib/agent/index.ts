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

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createDeepAgent } from "deepagents";
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
export function buildModel(temperature = 0.3) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add a Gemini API key from https://aistudio.google.com/apikey to .env.local (or your Vercel project settings).",
    );
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
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

/** Guardrail so a stuck run cannot spin forever on a serverless function. */
export const RECURSION_LIMIT = 40;
