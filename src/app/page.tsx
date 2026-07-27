import { ArrowRight, Scale } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/landing/hero";

/**
 * The run really is a fixed sequence, so numbering it is information rather
 * than decoration — this is the same order the agent works in.
 */
const RUN_STEPS = [
  {
    title: "Crawl",
    body: "Reads sitemap.xml — following the index into its page, practice, and attorney child sitemaps — then fetches a diagnostic sample across practice-area pages, attorney bios, contact, results, and about.",
  },
  {
    title: "Measure",
    body: "Thirty-odd deterministic checks: HTTPS, noindex, canonicals, response time, click-to-call, form length, schema completeness, NAP consistency, practice-page depth, bio depth.",
  },
  {
    title: "Judge",
    body: "Delegates to a content strategist subagent that reads the actual copy and decides whether it is specific to the jurisdiction or interchangeable filler. Measurement cannot answer that; a reader can.",
  },
  {
    title: "Score",
    body: "A weighted rubric turns the signals into a 0–100 score. It runs in code, not in the model, so the same site scores the same twice.",
  },
  {
    title: "Draft",
    body: "An outreach subagent writes one cold email under 120 words, leading with the sharpest measured finding and its exact number.",
  },
];

const HARNESS = [
  {
    label: "8 custom tools",
    body: "Crawl, three diagnostic suites, a page reader, playbook retrieval, the scorer, and the save that persists to Supabase.",
  },
  {
    label: "2 subagents",
    body: "A content strategist and an outreach writer, each with its own prompt, its own tool subset, and an isolated context window.",
  },
  {
    label: "A legal playbook",
    body: "Seven retrievable briefs on local pack ranking, practice-area architecture, legal schema, E-E-A-T, intake, technical failure modes, and partner outreach.",
  },
  {
    label: "Deterministic scoring",
    body: "Weighted for law firms specifically — local and intake outrank generic technical hygiene, because that is where legal marketing is actually won.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-full flex-1 flex-col bg-ink">
      <Hero />

      {/* How the run goes — a real sequence, so it is numbered. */}
      <section className="border-t border-ink-line bg-ink-sunken">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-24 sm:py-32 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow mb-5">The run</p>
            <h2 className="font-display text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.05] tracking-[-0.015em] text-vellum">
              Five steps, in this order, every time.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-soft">
              The agent plans before it acts, and you watch every tool call as it
              happens. Nothing about the run hides behind a spinner.
            </p>
          </div>

          <ol className="docket docket-rule relative space-y-10">
            {RUN_STEPS.map((step) => (
              <li key={step.title} className="docket-line">
                <h3 className="font-display text-xl text-vellum">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-soft">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The harness */}
      <section id="harness" className="border-t border-ink-line">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="mb-16 max-w-2xl">
            <p className="eyebrow mb-5">The harness</p>
            <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] tracking-[-0.015em] text-vellum">
              Tools measure. The model judges.
            </h2>
            <p className="mt-5 text-slate-soft">
              Every number in a teardown — word counts, status codes, schema
              fields, the score — comes from code. The model decides what to look
              at and what it means for a firm, and is never asked to recall a fact
              it could get wrong.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-sm border border-ink-line bg-ink-line sm:grid-cols-2">
            {HARNESS.map((item) => (
              <div key={item.label} className="bg-ink p-8">
                <h3 className="measure mb-3 text-xs uppercase tracking-[0.14em] text-brass">
                  {item.label}
                </h3>
                <p className="text-sm leading-relaxed text-slate-soft">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="border-t border-ink-line bg-ink-sunken">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] tracking-[-0.015em] text-vellum">
            Pick a firm. See what it finds.
          </h2>
          <Link
            href="/app"
            className="group mt-9 inline-flex items-center gap-2 rounded-sm bg-brass px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-[#d9b56d]"
          >
            Run a teardown
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Scale className="h-3.5 w-3.5 text-brass" strokeWidth={1.5} />
            <span className="font-display text-sm text-vellum">FirmScope</span>
          </div>
          <p className="text-xs text-slate-dim">
            Built with Next.js, Supabase, and the LangGraph Deep Agents harness.
          </p>
        </div>
      </footer>
    </main>
  );
}
