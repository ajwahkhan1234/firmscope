# FirmScope

**An SEO teardown analyst for US law firm websites, built as a LangGraph Deep Agent.**

Paste a law firm's URL. FirmScope crawls the site, runs ~32 deterministic checks
weighted for legal marketing, delegates the judgment calls to subagents, scores
the firm 0–100, writes an evidence-backed findings list, and drafts the cold
email that opens the conversation with the managing partner. Every run is
persisted to Supabase.

---

## The problem

An agency selling SEO to law firms has to audit every prospect before it can
pitch: crawl the site, work out what is actually costing the firm signed cases,
and write outreach specific enough that a managing partner replies. Done
properly that is 45–90 minutes per prospect, and it is the bottleneck on
outbound volume — not lead lists, not send capacity.

FirmScope compresses that to about 90 seconds and, more importantly, makes the
output *defensible*: every claim in the teardown traces back to something the
tools measured.

## Design: tools measure, the model judges

This is the central decision in the harness.

Everything factual — word counts, status codes, response times, schema fields,
phone-number counts, the score — is produced by code in
[`src/lib/agent/audits.ts`](src/lib/agent/audits.ts) and
[`src/lib/agent/score.ts`](src/lib/agent/score.ts). The model never estimates a
number, and it is instructed never to state a fact a tool did not give it.

The model does what code cannot: decides what to look at, reads the actual copy
and judges whether it is specific to the jurisdiction or interchangeable filler,
works out what a finding costs a firm in signed cases, and writes it up for a
partner who bills by the hour.

Two consequences worth noting:

- The score is **reproducible**, in the sense that matters: the rubric is a pure
  function of the signals, so identical signals always yield an identical score.
  The model cannot nudge it. In practice consecutive runs on the same site land
  within a couple of points (I measured 67 and 69), and the drift comes from
  live measurement — server response time varies, and the crawler may sample a
  slightly different page set — never from model sampling.
- A free-tier model is enough. The hard part is measurement, and measurement is
  not the model's job.

## The harness

Built on [`deepagents`](https://github.com/langchain-ai/deepagentsjs), which
supplies the planning tool (`write_todos`), a virtual filesystem, and the `task`
tool for subagent delegation. On top of that:

**8 custom tools** — [`src/lib/agent/tools.ts`](src/lib/agent/tools.ts)

| Tool | What it does |
| --- | --- |
| `crawl_firm_site` | Sitemap-aware crawl. Follows the sitemap index into its page/practice/attorney children, classifies every discovered URL, then fetches a diagnostic sample across page archetypes. |
| `run_technical_diagnostics` | HTTPS, robots.txt, sitemap, noindex, canonicals, response time, mobile viewport, click-to-call, form length, consultation framing. |
| `run_local_diagnostics` | LegalService/Attorney schema and its *field completeness*, Person markup on bios, FAQ/breadcrumb, NAP consistency across the site. |
| `run_content_diagnostics` | Title/meta/H1 hygiene, practice-area page existence and depth, blog presence, bio depth, case results. |
| `read_page` | Returns real page copy so a subagent can judge quality rather than measure it. |
| `consult_playbook` | Retrieves legal-SEO domain knowledge on demand. |
| `score_firm` | Deterministic weighted score plus failing signals ranked worst-first. |
| `save_teardown` | Persists the finished record to Supabase and renders it. |

**2 subagents** — each with its own prompt, tool subset, and isolated context:

- `content-strategist` — reads practice-area pages and bios; decides specific vs.
  filler; flags attorney-advertising compliance risks (e.g. case results published
  without the "past results do not guarantee a similar outcome" disclaimer).
- `outreach-writer` — writes one email under 120 words leading with the sharpest
  measured finding.

**Domain knowledge** — [`src/lib/agent/knowledge.ts`](src/lib/agent/knowledge.ts)
holds seven retrievable briefs (local pack ranking, practice-area architecture,
legal schema, E-E-A-T for YMYL legal, intake and conversion, technical failure
modes specific to legal website vendors, and partner outreach). It is retrieved
rather than stuffed into the system prompt, which keeps the prompt short enough
to stay in effect across a long run and makes the agent's choice of expertise
visible in the run timeline.

**Scoring weights** are legal-specific: local (0.26) and content (0.24) outrank
technical hygiene (0.18), because that is where legal marketing is actually won
or lost.

## Architecture

```
Browser ──POST /api/teardown──► Route handler (Node runtime, SSE)
                                      │
                                      ├─ createDeepAgent(...)  ← deepagents + Gemini
                                      │     ├─ 8 custom tools
                                      │     ├─ 2 subagents
                                      │     └─ write_todos / virtual FS
                                      │
                                      ├─ streams plan + every tool call ──► live docket UI
                                      └─ Supabase (service role) ──► teardowns, teardown_events
```

The agent runs **inside the Next.js app** rather than as a separate service.
There is no second deployment, no cross-service auth, and the run streams
straight to the browser. For a single-user tool at this scope that is the right
trade; see *Tradeoffs* for when it stops being right.

**Supabase is never touched from the browser.** All reads and writes go through
route handlers using the service-role key, so RLS is enabled with no public
policies at all.

## Running it locally

```bash
npm install
cp .env.example .env.local   # fill in the three values below
npm run dev
```

**1. Gemini key** — the free tier is enough.
Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and set
`GOOGLE_API_KEY`.

**2. Supabase** — create a project, open the SQL Editor, then paste and run
[`supabase/schema.sql`](supabase/schema.sql). Then from **Project Settings**:

- `NEXT_PUBLIC_SUPABASE_URL` — Data API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — API Keys → `service_role` (secret)

The app degrades gracefully without Supabase: teardowns still run and render,
they just are not saved.

There is also a no-LLM smoke test for the deterministic layer:

```bash
npx tsx scripts/test-audit.mts https://some-law-firm.com
```

## Secrets

No key is in this repository, and none needs to be. `.env.example` documents
the three variables with blank values; the real ones live only in Vercel's
environment variables, injected at runtime.

Two details that matter:

- **`SUPABASE_SERVICE_ROLE_KEY` is not prefixed with `NEXT_PUBLIC_`.** Next.js
  only exposes `NEXT_PUBLIC_*` to the browser bundle, so the service-role key —
  which bypasses row-level security entirely — stays server-side. The browser
  never talks to Supabase at all; every read and write goes through a route
  handler.
- **`.gitignore` ignores `.env*` but un-ignores `.env.example`**, so a local
  env file cannot be committed by accident.

To run it yourself, copy `.env.example` to `.env.local` and fill in your own
keys. Nothing here is shared.

## Deploying to Vercel

1. Push to GitHub, import the repo in Vercel.
2. Add `GOOGLE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` under Settings → Environment Variables.
   Do not commit them to the repo — Next.js loads a committed `.env`, which is
   how secrets end up in version control.
3. Deploy. Changing an environment variable later requires a redeploy.

The teardown route sets `maxDuration = 300`. On Hobby with Fluid Compute that is
enough for a full run; a typical run is 60–90s.

## Tradeoffs

**Gemini free tier.** Chosen so the deployed demo is openly testable without
shipping a paid key. It cost more than expected, and the details are worth
stating because they shaped the harness:

- The free tier bills **per model, per day** — not only per minute. Full Flash
  allows **20 requests/day**, and one teardown uses 15–20. The first run would
  succeed and the second would die halfway. The default is therefore
  `gemini-flash-lite-latest`, which has a much higher daily ceiling.
- Pinned model versions rot. `gemini-2.5-flash` now returns *"no longer
  available to new users"* for freshly created keys, so the default is a moving
  alias rather than a version.
- Calls are paced through a shared token bucket
  ([`throttle.ts`](src/lib/agent/throttle.ts)) with exponential-backoff retry on
  429, because the agent naturally bursts (three diagnostics fire at once, then
  a subagent reads several pages).

This is exactly why the harness pushes measurement into deterministic code: a
lite model is entirely adequate when it is orchestrating tools and writing
prose, and never asked to recall a fact. A paid key would remove the ceiling
without changing the design.

**Agent in the Next.js app, not a separate server.** Faster to build and deploy,
one set of secrets. The limit is the serverless execution ceiling — a run that
needed ten minutes, or that needed to survive a browser refresh, would have to
move to a queue with a worker and LangGraph checkpointing.

**A 7-page diagnostic sample, not a full crawl.** Deep crawls do not fit in a
serverless request. The mitigation: the crawler classifies *every* discovered URL
without fetching it, so existence checks ("does this firm have a blog?") read the
whole site while depth checks read the sample. Conflating those two produced
false findings in an early version and was worth fixing — a teardown that tells a
firm it has no attorney bios when it has 47 is worse than no teardown.

**No rank or traffic data.** There is no free API for legal SERP positions, and
inventing numbers would defeat the purpose. FirmScope reports what it can measure
on-site and says nothing about rankings.

**Heuristic page classification.** URL-pattern based, so it misses some
conventions — non-English URL paths, for instance, fall into `other`.

## What I would build next

1. **Competitor delta.** The finding that actually sells is "the three firms
   ranking above you average 1,400 words; you have 180." That needs a SERP source
   (DataForSEO, Serper) and is the single biggest upgrade to output quality.
2. **Durable runs.** Move execution to a queue with LangGraph checkpointing so a
   run survives a refresh and can be resumed rather than restarted.
3. **PDF export.** Agencies want to attach the teardown; the record already
   renders as a document, so this is mostly print styling.
4. **Human-in-the-loop before send.** `deepagents` supports `interruptOn`; pausing
   for approval on the outreach draft is a natural fit.
5. **Batch mode.** Feed a list of firms, rank by opportunity size, work the list.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase ·
`deepagents` (LangGraph) · Gemini · Vercel
