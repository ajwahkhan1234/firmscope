"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
  Scale,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Teardown } from "@/lib/agent/types";
import type { TeardownRow } from "@/lib/supabase/types";
import { Docket } from "./docket";
import { Report } from "./report";
import { useTeardownRun } from "./use-teardown-run";

const EXAMPLES = [
  { label: "Personal injury · Dallas", url: "thebarberlawfirm.com" },
  { label: "Personal injury · Houston", url: "thedoanlawfirm.com" },
];

/** Rebuild a Teardown from a persisted row so history renders the same report. */
function rowToTeardown(row: TeardownRow): Teardown | null {
  if (!row.overall_score || !row.grade) return null;
  return {
    firmUrl: row.firm_url,
    firmName: row.firm_name,
    city: row.city,
    practiceArea: row.practice_area,
    scorecard: {
      overall: row.overall_score,
      grade: row.grade as Teardown["scorecard"]["grade"],
      headline: row.headline ?? "",
      categories: row.category_scores ?? [],
    },
    findings: row.findings ?? [],
    signals: row.signals ?? [],
    outreachEmail: row.outreach_subject
      ? {
          subject: row.outreach_subject,
          body: row.outreach_body ?? "",
          hook: row.outreach_hook ?? "",
        }
      : null,
    pagesAnalyzed: row.pages_analyzed ?? 0,
  };
}

export function Workspace({ initialUrl }: { initialUrl: string }) {
  const run = useTeardownRun();
  const [url, setUrl] = useState(initialUrl);
  const [city, setCity] = useState("");
  const [practiceArea, setPracticeArea] = useState("");
  const [history, setHistory] = useState<TeardownRow[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/teardowns");
      const data = await res.json();
      setHistory(data.teardowns ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoaded(true);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  // Refresh history once a run lands so the new teardown appears.
  useEffect(() => {
    if (run.status === "done") void loadHistory();
  }, [run.status]);

  const running = run.status === "running";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || running) return;
    void run.start({
      url: url.trim(),
      city: city.trim() || undefined,
      practiceArea: practiceArea.trim() || undefined,
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Scale className="h-4 w-4 text-brass" strokeWidth={1.5} />
            <span className="font-display text-lg tracking-tight text-vellum">
              FirmScope
            </span>
          </Link>
          {running && (
            <span className="measure flex items-center gap-2 text-xs text-arc">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-10 lg:flex-row lg:gap-14">
        {/* Left rail: input + history */}
        <aside className="w-full shrink-0 space-y-10 lg:w-80">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="url" className="eyebrow mb-2 block">
                Firm website
              </label>
              <input
                id="url"
                type="text"
                inputMode="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="lawfirm.com"
                disabled={running}
                className="measure w-full rounded-sm border border-ink-line-bright bg-ink-raised px-3.5 py-2.5 text-sm text-vellum placeholder:text-slate-dim transition-colors focus:border-brass focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="city" className="eyebrow mb-2 block">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Optional"
                  disabled={running}
                  className="w-full rounded-sm border border-ink-line-bright bg-ink-raised px-3.5 py-2.5 text-sm text-vellum placeholder:text-slate-dim transition-colors focus:border-brass focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="practice" className="eyebrow mb-2 block">
                  Practice
                </label>
                <input
                  id="practice"
                  type="text"
                  value={practiceArea}
                  onChange={(e) => setPracticeArea(e.target.value)}
                  placeholder="Optional"
                  disabled={running}
                  className="w-full rounded-sm border border-ink-line-bright bg-ink-raised px-3.5 py-2.5 text-sm text-vellum placeholder:text-slate-dim transition-colors focus:border-brass focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {running ? (
              <button
                type="button"
                onClick={run.cancel}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-ink-line-bright px-5 py-2.5 text-sm text-slate-soft transition-colors hover:border-critical/50 hover:text-critical"
              >
                <Square className="h-3 w-3" fill="currentColor" />
                Stop the run
              </button>
            ) : (
              <button
                type="submit"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-brass px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-[#d9b56d]"
              >
                Run the teardown
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </button>
            )}

            {run.status === "idle" && (
              <div className="pt-2">
                <p className="eyebrow mb-2">Try one</p>
                <div className="space-y-1">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.url}
                      type="button"
                      onClick={() => setUrl(ex.url)}
                      className="block w-full text-left text-xs text-slate-soft transition-colors hover:text-brass"
                    >
                      <span className="measure">{ex.url}</span>
                      <span className="ml-2 text-slate-dim">{ex.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* History */}
          <section>
            <p className="eyebrow mb-3">Past teardowns</p>
            {!historyLoaded ? (
              <p className="text-xs text-slate-dim">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-dim">
                Nothing saved yet. Completed teardowns are stored in Supabase and
                appear here.
              </p>
            ) : (
              <ul className="space-y-px overflow-hidden rounded-sm border border-ink-line">
                {history.map((row) => {
                  const restored = rowToTeardown(row);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={!restored || running}
                        onClick={() => {
                          if (!restored) return;
                          run.reset();
                          run.setTeardown(restored);
                          run.setStatus("done");
                        }}
                        className="flex w-full items-center justify-between gap-3 bg-ink-raised px-3.5 py-2.5 text-left transition-colors hover:bg-ink-line/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-vellum">
                            {row.firm_name ?? row.firm_url}
                          </span>
                          <span className="measure block text-[0.625rem] text-slate-dim">
                            {new Date(row.created_at).toLocaleDateString()} ·{" "}
                            {row.status}
                          </span>
                        </span>
                        {row.overall_score !== null && (
                          <span className="measure shrink-0 text-sm tabular-nums text-brass">
                            {row.overall_score}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>

        {/* Main column */}
        <main className="min-w-0 flex-1">
          {run.status === "idle" && (
            <EmptyState />
          )}

          {run.error && (
            <div className="mb-8 flex items-start gap-3 rounded-sm border border-critical/30 bg-critical/8 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
              <div>
                <p className="text-sm text-vellum">The run stopped.</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-soft">
                  {run.error}
                </p>
              </div>
            </div>
          )}

          {(running || run.entries.length > 0) && run.status !== "done" && (
            <Docket entries={run.entries} todos={run.todos} status={run.status} />
          )}

          {run.status === "done" && run.teardown && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <Report
                teardown={run.teardown}
                durationMs={run.durationMs}
                persisted={run.persisted}
              />

              {run.entries.length > 0 && (
                <details className="mt-12 border-t border-ink-line pt-6">
                  <summary className="eyebrow cursor-pointer transition-colors hover:text-vellum">
                    Show the run record ({run.entries.length} steps)
                  </summary>
                  <div className="mt-6">
                    <Docket
                      entries={run.entries}
                      todos={run.todos}
                      status={run.status}
                    />
                  </div>
                </details>
              )}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

/** What the agent can reach for. Shown while idle so the harness is legible
 *  before you ever run it — and so the panel is not just empty space. */
const TOOL_BELT = [
  ["crawl_firm_site", "Sitemap-aware crawl, diagnostic page sample"],
  ["run_technical_diagnostics", "HTTPS, noindex, canonicals, speed, intake"],
  ["run_local_diagnostics", "Legal schema completeness, NAP consistency"],
  ["run_content_diagnostics", "Practice-page depth, bios, case results"],
  ["read_page", "Reads real copy when judgment is needed"],
  ["consult_playbook", "Seven legal-SEO briefs, retrieved on demand"],
  ["score_firm", "Deterministic 0–100, weighted for law firms"],
  ["save_teardown", "Persists the record to Supabase"],
] as const;

const SUBAGENTS = [
  ["content-strategist", "Reads the copy. Decides specific vs. filler."],
  ["outreach-writer", "Writes one email under 120 words."],
] as const;

function EmptyState() {
  return (
    <div>
      <p className="eyebrow mb-5">Ready</p>
      <h1 className="max-w-xl font-display text-3xl leading-tight tracking-[-0.01em] text-vellum">
        Paste a firm&apos;s URL and watch the agent work.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-soft">
        FirmScope crawls the site, runs about thirty deterministic checks across
        technical, local, content, authority, and intake, delegates the judgment
        calls to subagents, scores what it finds, and drafts the outreach email.
      </p>
      <p className="measure mt-5 flex items-center gap-2 text-xs text-slate-dim">
        <Clock className="h-3 w-3" />
        Typically 60–90 seconds
      </p>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section>
          <p className="eyebrow mb-4">Tool belt</p>
          <ul className="space-y-3">
            {TOOL_BELT.map(([name, what]) => (
              <li key={name}>
                <p className="measure text-xs text-brass">{name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-soft">{what}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="eyebrow mb-4">Subagents</p>
          <ul className="space-y-3">
            {SUBAGENTS.map(([name, what]) => (
              <li key={name}>
                <p className="measure text-xs text-arc">{name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-soft">{what}</p>
              </li>
            ))}
          </ul>

          <p className="eyebrow mb-3 mt-9">Also available</p>
          <p className="text-xs leading-relaxed text-slate-soft">
            The Deep Agents harness supplies planning (
            <span className="measure text-slate-dim">write_todos</span>) and a
            virtual filesystem (
            <span className="measure text-slate-dim">write_file</span>,{" "}
            <span className="measure text-slate-dim">read_file</span>) that the
            agent uses for intermediate notes during a run.
          </p>
        </section>
      </div>
    </div>
  );
}
