/**
 * Shared domain types for the FirmScope teardown harness.
 *
 * These types are the contract between three layers:
 *   1. deterministic audit tools (they emit `Signal`s)
 *   2. the scoring function (it turns `Signal`s into a `Scorecard`)
 *   3. the UI + Supabase (they render/persist a `Teardown`)
 */

export const CATEGORIES = [
  "technical",
  "local",
  "content",
  "authority",
  "conversion",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Effort = "quick" | "moderate" | "heavy";

/**
 * A single observed fact about the firm's site. Signals are emitted by
 * deterministic tools only — never invented by the model. `passed: false`
 * means the check found a problem worth reporting.
 */
export interface Signal {
  /** Stable key, e.g. "schema.attorney_missing" */
  key: string;
  category: Category;
  passed: boolean;
  /** Weight of this signal inside its category, 1-10. */
  weight: number;
  /** Literal observation, e.g. "3 of 7 practice-area pages are under 400 words". */
  detail: string;
  /** Where it was observed. */
  url?: string;
}

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  /** What was actually measured — must trace back to a Signal. */
  evidence: string;
  /** Why it costs the firm signed cases. */
  impact: string;
  /** The concrete remediation. */
  fix: string;
  effort: Effort;
}

export interface CategoryScore {
  category: Category;
  score: number;
  /** Sum of weights of failed signals in this category. */
  lostWeight: number;
  totalWeight: number;
}

export interface Scorecard {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: CategoryScore[];
  /** One-line read on the firm's competitive position. */
  headline: string;
}

export interface PageRecord {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1s: string[];
  wordCount: number;
  /** Detected page archetype for a law-firm site. */
  pageType:
    | "home"
    | "practice-area"
    | "attorney-bio"
    | "contact"
    | "about"
    | "results"
    | "blog"
    | "other";
  jsonLdTypes: string[];
  internalLinks: number;
  /** First ~1200 chars of readable body copy, for LLM judgment. */
  excerpt: string;
  phones: string[];
  /** Response time in ms for the document request. */
  ttfbMs: number;
}

export type PageType = PageRecord["pageType"];

/**
 * Everything the crawler *discovered* (from sitemaps or homepage links),
 * classified but not fetched.
 *
 * This exists to keep existence checks honest. We only fetch a diagnostic
 * sample of ~7 pages, so "no blog page in the sample" must never be reported
 * as "this firm has no blog". Existence reads this; depth and quality checks
 * read the fetched `pages`.
 */
export interface DiscoveredInventory {
  total: number;
  byType: Record<PageType, number>;
  samples: Record<PageType, string[]>;
}

export interface CrawlResult {
  origin: string;
  finalUrl: string;
  firmName: string | null;
  pages: PageRecord[];
  discovered: DiscoveredInventory;
  sitemapFound: boolean;
  sitemapUrlCount: number;
  robotsTxtFound: boolean;
  robotsBlocksAll: boolean;
  https: boolean;
  redirectedToWww: boolean;
  errors: string[];
}

export interface Teardown {
  firmUrl: string;
  firmName: string | null;
  city: string | null;
  practiceArea: string | null;
  scorecard: Scorecard;
  findings: Finding[];
  outreachEmail: {
    subject: string;
    body: string;
    hook: string;
  } | null;
  signals: Signal[];
  pagesAnalyzed: number;
}
