/**
 * FirmScope tool belt.
 *
 * Division of labour, which is the central design decision in this harness:
 *
 *   Tools measure.   The model judges.
 *
 * Every number in the final teardown (word counts, status codes, schema
 * fields, the score) is produced by code in these tools. The model's job is to
 * decide what to look at, interpret what the measurements mean for a law firm,
 * and write it up. It is never asked to recall or estimate a fact it could get
 * wrong, which is what keeps a free-tier model usable for this.
 *
 * Tools are created per-run via a factory so they can share the crawl cache and
 * accumulated signals without a global.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  auditAuthority,
  auditContent,
  auditConversion,
  auditNap,
  auditSchema,
  auditTechnical,
} from "./audits";
import { crawlFirmSite, normalizeUrl } from "./crawl";
import { lookupPlaybook, PLAYBOOK } from "./knowledge";
import { computeScorecard, rankFailedSignals } from "./score";
import type { CrawlResult, Finding, Scorecard, Signal } from "./types";

export type EmitKind =
  | "plan"
  | "tool_start"
  | "tool_end"
  | "subagent"
  | "note"
  | "error"
  | "done";

export interface RunContext {
  firmUrl: string;
  city: string | null;
  practiceArea: string | null;
  crawl: CrawlResult | null;
  signals: Signal[];
  scorecard: Scorecard | null;
  finalTeardown: {
    firmName: string | null;
    findings: Finding[];
    outreach: { subject: string; body: string; hook: string } | null;
  } | null;
  emit: (kind: EmitKind, label: string, payload?: unknown) => void;
}

export function createRunContext(
  firmUrl: string,
  city: string | null,
  practiceArea: string | null,
  emit: RunContext["emit"],
): RunContext {
  return {
    firmUrl,
    city,
    practiceArea,
    crawl: null,
    signals: [],
    scorecard: null,
    finalTeardown: null,
    emit,
  };
}

/** Merge signals into the run, replacing any with the same key. */
function addSignals(ctx: RunContext, incoming: Signal[]): void {
  const byKey = new Map(ctx.signals.map((sig) => [sig.key, sig]));
  for (const sig of incoming) byKey.set(sig.key, sig);
  ctx.signals = Array.from(byKey.values());
}

function requireCrawl(ctx: RunContext): CrawlResult {
  if (!ctx.crawl) {
    throw new Error(
      "No site data yet. Call crawl_firm_site first — every other diagnostic reads from its output.",
    );
  }
  return ctx.crawl;
}

/** Compact signal rendering for the model: verdict + the literal observation. */
function renderSignals(signals: Signal[]): string {
  return signals
    .map(
      (sig) =>
        `${sig.passed ? "PASS" : "FAIL"} [${sig.key}] (weight ${sig.weight}/10, ${sig.category})\n  ${sig.detail}`,
    )
    .join("\n");
}

export function createTools(ctx: RunContext) {
  /* ---------------------------------------------------------------- */
  const crawlTool = tool(
    async ({ url, maxPages }) => {
      const target = normalizeUrl(url || ctx.firmUrl);
      ctx.emit("tool_start", `Crawling ${new URL(target).hostname}`, { url: target });

      const crawl = await crawlFirmSite(target, maxPages ?? 7);
      ctx.crawl = crawl;

      const inventory = crawl.pages
        .map(
          (p) =>
            `- [${p.pageType}] ${p.url}\n    title: ${p.title ?? "(none)"}\n    ${p.wordCount} words · H1s: ${
              p.h1s.length
            } · JSON-LD: ${p.jsonLdTypes.join(", ") || "none"} · ${p.ttfbMs}ms`,
        )
        .join("\n");

      ctx.emit("tool_end", `Crawled ${crawl.pages.length} pages`, {
        pages: crawl.pages.length,
        firmName: crawl.firmName,
        sitemapFound: crawl.sitemapFound,
        discovered: crawl.discovered.byType,
      });

      const shape = Object.entries(crawl.discovered.byType)
        .filter(([, n]) => n > 0)
        .map(([type, n]) => `${type}: ${n}`)
        .join(" · ");

      return `Crawled ${crawl.finalUrl}
Firm name (detected): ${crawl.firmName ?? "unknown"}
HTTPS: ${crawl.https} · sitemap.xml: ${crawl.sitemapFound ? `yes (${crawl.sitemapUrlCount} URLs)` : "no"} · robots.txt: ${crawl.robotsTxtFound ? "yes" : "no"}

Whole-site shape (${crawl.discovered.total} URLs discovered, classified without fetching):
${shape}

Diagnostic sample actually fetched (${crawl.pages.length} pages):
${inventory}
${crawl.errors.length ? `\nFetch errors:\n${crawl.errors.map((e) => `- ${e}`).join("\n")}` : ""}

Important: the sample is a subset. Never say the firm "has no X" just because X is not in the sample — the whole-site shape above is what tells you whether something exists.

Next: run the three diagnostic tools. They read from this crawl.`;
    },
    {
      name: "crawl_firm_site",
      description:
        "Fetch and inventory a law firm's website. Discovers pages via sitemap.xml or homepage links, then fetches a diagnostic sample covering practice-area pages, attorney bios, contact, results, about, and blog. Must be called first — every other diagnostic reads its output. Returns a page inventory with types, titles, word counts, and detected structured data.",
      schema: z.object({
        url: z
          .string()
          .describe("The law firm's website URL. Use the URL supplied in the task."),
        maxPages: z
          .number()
          .optional()
          .describe("Maximum pages to fetch, 3-10. Defaults to 7."),
      }),
    },
  );

  /* ---------------------------------------------------------------- */
  const technicalTool = tool(
    async () => {
      const crawl = requireCrawl(ctx);
      ctx.emit("tool_start", "Running technical & intake diagnostics");

      const technical = auditTechnical(crawl);
      const conversion = await auditConversion(crawl);
      const signals = [...technical, ...conversion];
      addSignals(ctx, signals);

      const failed = signals.filter((sig) => !sig.passed).length;
      ctx.emit("tool_end", `Technical & intake: ${failed} issue(s) found`, {
        checks: signals.length,
        failed,
      });

      return `Technical foundation and intake diagnostics (${signals.length} checks, ${failed} failing):\n\n${renderSignals(
        signals,
      )}`;
    },
    {
      name: "run_technical_diagnostics",
      description:
        "Run deterministic technical and intake checks against the crawled site: HTTPS, robots.txt, sitemap, noindex directives, canonicals, server response time, mobile viewport, click-to-call presence, contact form length, and free-consultation framing. Returns pass/fail signals with literal observations and weights.",
      schema: z.object({}),
    },
  );

  /* ---------------------------------------------------------------- */
  const localTool = tool(
    async () => {
      const crawl = requireCrawl(ctx);
      ctx.emit("tool_start", "Auditing structured data & local signals");

      const schema = await auditSchema(crawl);
      const nap = auditNap(crawl);
      const signals = [...schema.signals, ...nap.signals];
      addSignals(ctx, signals);

      const failed = signals.filter((sig) => !sig.passed).length;
      ctx.emit("tool_end", `Local & schema: ${failed} issue(s) found`, {
        typesFound: schema.typesFound,
        distinctPhones: nap.distinctPhones.length,
        failed,
      });

      return `Structured data and local presence (${signals.length} checks, ${failed} failing):

Schema types found across the site: ${schema.typesFound.join(", ") || "none"}
Business-node fields present: ${schema.orgFieldsPresent.join(", ") || "none"}
Business-node fields missing: ${schema.orgFieldsMissing.join(", ") || "none"}
Distinct phone numbers found on site: ${nap.distinctPhones.length}

${renderSignals(signals)}`;
    },
    {
      name: "run_local_diagnostics",
      description:
        "Audit structured data and local presence: whether the site uses LegalService/Attorney schema rather than a generic stub, how complete the business schema node is, whether attorney bios carry Person/Attorney markup, FAQ and breadcrumb markup, plus NAP consistency (how many distinct phone numbers appear across the site). This is where law firms most often lose the local pack.",
      schema: z.object({}),
    },
  );

  /* ---------------------------------------------------------------- */
  const contentTool = tool(
    async () => {
      const crawl = requireCrawl(ctx);
      ctx.emit("tool_start", "Auditing content architecture & authority");

      const content = auditContent(crawl);
      const authority = auditAuthority(crawl);
      const signals = [...content, ...authority];
      addSignals(ctx, signals);

      const failed = signals.filter((sig) => !sig.passed).length;
      const practice = crawl.pages.filter((p) => p.pageType === "practice-area");
      const bios = crawl.pages.filter((p) => p.pageType === "attorney-bio");

      ctx.emit("tool_end", `Content & authority: ${failed} issue(s) found`, {
        practicePages: practice.length,
        bios: bios.length,
        failed,
      });

      return `Content architecture and authority (${signals.length} checks, ${failed} failing):

Practice-area pages found: ${practice.length}${
        practice.length
          ? ` (word counts: ${practice.map((p) => p.wordCount).join(", ")})`
          : ""
      }
Attorney bio pages found: ${bios.length}${
        bios.length ? ` (word counts: ${bios.map((p) => p.wordCount).join(", ")})` : ""
      }

${renderSignals(signals)}`;
    },
    {
      name: "run_content_diagnostics",
      description:
        "Audit content architecture and E-E-A-T structure: title/meta/H1 hygiene, whether dedicated practice-area pages exist and how deep they are, blog presence, attorney bio existence and depth, and case-results sections. Legal is maximum-severity YMYL, so bio and authority gaps are weighted heavily here.",
      schema: z.object({}),
    },
  );

  /* ---------------------------------------------------------------- */
  const readPageTool = tool(
    async ({ url }) => {
      const crawl = requireCrawl(ctx);
      const page =
        crawl.pages.find((p) => p.url === url) ??
        crawl.pages.find((p) => p.url.includes(url));

      if (!page) {
        return `That URL is not in the crawl. Pages available:\n${crawl.pages
          .map((p) => `- ${p.url}`)
          .join("\n")}`;
      }

      ctx.emit("tool_start", `Reading ${new URL(page.url).pathname}`, { url: page.url });
      ctx.emit("tool_end", `Read ${page.pageType} page`, { url: page.url });

      return `${page.url}
Type: ${page.pageType} · ${page.wordCount} words · ${page.internalLinks} internal links
Title: ${page.title ?? "(none)"}
Meta description: ${page.metaDescription ?? "(none)"}
H1: ${page.h1s.join(" | ") || "(none)"}
JSON-LD types: ${page.jsonLdTypes.join(", ") || "none"}

Body excerpt (first 1200 chars):
"""
${page.excerpt}
"""`;
    },
    {
      name: "read_page",
      description:
        "Read the actual copy of one crawled page — title, meta, H1, and a body excerpt. Use this when you need to judge content quality rather than measure it: is this practice-area page genuinely specific to the jurisdiction, or is it generic filler? Does this bio establish credentials?",
      schema: z.object({
        url: z.string().describe("The page URL, as listed in the crawl inventory."),
      }),
    },
  );

  /* ---------------------------------------------------------------- */
  const playbookTool = tool(
    async ({ topic }) => {
      const entries = lookupPlaybook(topic);
      ctx.emit("tool_start", `Consulting playbook: ${topic}`);
      ctx.emit("tool_end", `Loaded ${entries.map((e) => e.topic).join(", ")}`, {
        topics: entries.map((e) => e.topic),
      });

      return entries
        .map((e) => `## ${e.topic}\n${e.summary}\n\n${e.body}`)
        .join("\n\n---\n\n");
    },
    {
      name: "consult_playbook",
      description: `Retrieve FirmScope's law-firm SEO playbook on a topic. Use this before writing findings or outreach so recommendations reflect legal-specific practice rather than generic SEO advice. Available topics: ${PLAYBOOK.map(
        (p) => p.topic,
      ).join(", ")}.`,
      schema: z.object({
        topic: z
          .string()
          .describe(
            "Topic or keywords, e.g. 'local-pack-ranking', 'legal-schema', 'eeat-legal', 'conversion-legal', 'practice-area-architecture', 'technical-legal', 'outreach-legal'.",
          ),
      }),
    },
  );

  /* ---------------------------------------------------------------- */
  const scoreTool = tool(
    async () => {
      if (ctx.signals.length === 0) {
        throw new Error(
          "No diagnostics have been run yet. Run the three diagnostic tools before scoring.",
        );
      }
      ctx.emit("tool_start", "Computing FirmScope score");

      const scorecard = computeScorecard(ctx.signals);
      ctx.scorecard = scorecard;

      const ranked = rankFailedSignals(ctx.signals);
      ctx.emit("tool_end", `Score: ${scorecard.overall}/100 (${scorecard.grade})`, scorecard);

      return `FirmScope score: ${scorecard.overall}/100 (grade ${scorecard.grade})
${scorecard.headline}

Category breakdown:
${scorecard.categories
  .map((c) => `- ${c.category}: ${c.score}/100 (lost ${c.lostWeight} of ${c.totalWeight} weight)`)
  .join("\n")}

Failing signals, worst first — these are your finding candidates:
${ranked.map((sig, i) => `${i + 1}. [${sig.key}] w${sig.weight} ${sig.category}\n   ${sig.detail}`).join("\n")}

Write findings only from this list. Do not invent issues that are not here.`;
    },
    {
      name: "score_firm",
      description:
        "Compute the deterministic FirmScope score (0-100) from every signal gathered so far, weighted for law-firm priorities, and return the failing signals ranked worst-first. Call this after all three diagnostic tools have run. The findings you write must come from the ranked list this returns.",
      schema: z.object({}),
    },
  );

  /* ---------------------------------------------------------------- */
  const saveTool = tool(
    async ({ firmName, findings, outreachSubject, outreachBody, outreachHook }) => {
      if (!ctx.scorecard) {
        throw new Error("Call score_firm before saving — the teardown needs a score.");
      }
      ctx.emit("tool_start", "Saving teardown");

      ctx.finalTeardown = {
        firmName: firmName ?? ctx.crawl?.firmName ?? null,
        findings: findings.map((f, i) => ({ ...f, id: `f${i + 1}` })),
        outreach: {
          subject: outreachSubject,
          body: outreachBody,
          hook: outreachHook,
        },
      };

      ctx.emit("tool_end", `Saved teardown with ${findings.length} findings`, {
        findings: findings.length,
      });

      return `Teardown saved: ${findings.length} findings, score ${ctx.scorecard.overall}/100, outreach email drafted. The report is now on screen for the user. You are done — reply with a two-sentence summary and stop.`;
    },
    {
      name: "save_teardown",
      description:
        "Persist the finished teardown and render it to the user. Call this exactly once, at the very end, after score_firm and after the outreach email has been drafted. Findings must be ordered most-damaging first and must each trace back to a failing signal from score_firm.",
      schema: z.object({
        firmName: z.string().optional().describe("The firm's name as it appears on the site."),
        findings: z
          .array(
            z.object({
              category: z.enum(["technical", "local", "content", "authority", "conversion"]),
              severity: z.enum(["critical", "high", "medium", "low"]),
              title: z
                .string()
                .describe("Short, plain-English problem statement. No jargon."),
              evidence: z
                .string()
                .describe(
                  "The literal measurement from a failing signal, quoted faithfully — numbers, URLs, counts.",
                ),
              impact: z
                .string()
                .describe("Why this costs the firm signed cases. Concrete, not generic."),
              fix: z.string().describe("The specific remediation."),
              effort: z.enum(["quick", "moderate", "heavy"]),
            }),
          )
          .min(3)
          .max(8)
          .describe("Between 3 and 8 findings, most damaging first."),
        outreachSubject: z
          .string()
          .describe("Cold email subject line. Specific and low-drama, lowercase is fine."),
        outreachBody: z
          .string()
          .describe("Cold email body, under 120 words, leading with the single sharpest finding."),
        outreachHook: z
          .string()
          .describe("The one observation the email leads with, in a single sentence."),
      }),
    },
  );

  return {
    all: [
      crawlTool,
      technicalTool,
      localTool,
      contentTool,
      readPageTool,
      playbookTool,
      scoreTool,
      saveTool,
    ],
    /** Subset handed to the content-strategist subagent. */
    forContentStrategist: [readPageTool, playbookTool],
    /** Subset handed to the outreach-writer subagent. */
    forOutreachWriter: [playbookTool],
  };
}
