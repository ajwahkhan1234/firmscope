/**
 * Row shapes, kept out of the `server-only` module so client components can
 * import them without pulling the service-role client into the browser bundle.
 */

import type { Finding, Scorecard, Signal } from "@/lib/agent/types";

export interface TeardownRow {
  id: string;
  created_at: string;
  completed_at: string | null;
  firm_url: string;
  firm_name: string | null;
  city: string | null;
  practice_area: string | null;
  status: "running" | "complete" | "failed";
  error: string | null;
  overall_score: number | null;
  grade: string | null;
  headline: string | null;
  category_scores: Scorecard["categories"];
  findings: Finding[];
  signals: Signal[];
  outreach_subject: string | null;
  outreach_body: string | null;
  outreach_hook: string | null;
  pages_analyzed: number | null;
  duration_ms: number | null;
}
