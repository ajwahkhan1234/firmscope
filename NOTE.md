# FirmScope: written note

**Live:** <your-vercel-url>
**Repo:** https://github.com/ajwahkhan1234/firmscope

## The problem I picked

I work on SEO for US law firms, so I built for a workflow I actually run.

Before an agency can pitch a firm, someone has to audit that firm's website, work out what is genuinely costing them signed cases, and write an email specific enough that a managing partner replies instead of deleting it. Done properly that is 45 to 90 minutes per prospect. It is the real bottleneck on outbound, not lead lists and not sending capacity.

FirmScope does that pass in about two minutes. You paste a law firm URL. It crawls the site, runs about 32 deterministic checks weighted for legal marketing, delegates the judgment calls to subagents, scores the firm out of 100, writes a findings list where every claim traces to something it measured, and drafts the cold email. Everything is saved to Supabase.

## The key decision: tools measure, the model judges

This is the one call that shaped everything else.

Every fact in a teardown comes from code, not the model. Word counts, status codes, response times, schema field completeness, how many distinct phone numbers appear across the site, the score itself. The model is told it may never state a fact a tool did not give it.

What the model does is the part code cannot: decide what to look at, read the actual page copy and judge whether it is specific to the jurisdiction or interchangeable filler, work out what a finding costs the firm in signed cases, and write it for a partner who bills by the hour.

Two things fall out of that. The score becomes a pure function of the signals, so the model cannot talk it up or down. And a free tier model turns out to be enough, because the hard part is measurement and measurement is not the model's job.

## How the harness is built

I used LangChain's `deepagents`, which supplies the planning tool, a virtual filesystem, and subagent delegation. On top of that I added:

* Eight custom tools: a sitemap aware crawler, three diagnostic suites (technical and intake, local and schema, content and authority), a page reader for when judgment is needed, playbook retrieval, the scorer, and the save that persists to Supabase.
* Two subagents with their own prompts, tool subsets, and isolated context. A content strategist that reads practice area pages and bios and decides specific versus filler, and an outreach writer that produces one email under 120 words.
* A legal SEO playbook of seven briefs (local pack ranking, practice area architecture, legal schema, E-E-A-T for YMYL legal, intake, vendor specific technical failures, partner outreach). It is retrieved on demand rather than stuffed into the system prompt, which keeps the prompt short enough to hold across a long run and makes the agent's choice of expertise visible in the run timeline.

Scoring weights are legal specific. Local and content outrank generic technical hygiene, because that is where legal marketing is actually won.

## What went wrong, and what I changed

The parts I am most glad I caught came from reading real output rather than checking that it ran.

**It told a firm with 47 attorney bios that it had none.** I only fetch a seven page sample, and existence checks were reading the sample instead of the whole site. Now the crawler classifies every discovered URL without fetching it, so existence questions read the entire site while depth questions read the sample.

**The crawler was reading only the first child of a sitemap index.** On a 556 URL site that meant auditing 201 blog posts and zero practice area pages.

**The drafted email invented competitor data.** It wrote "competitors ranking in your market average 800 to 1,500 words". FirmScope has no competitor or ranking data at all. The model had taken a general benchmark from my own playbook and turned it into a specific claim about that firm's competitors. For a product whose entire value is being defensible, that is the worst possible bug, so the prompts now forbid it explicitly and I verified it is gone.

**The deployed app returned a 500 that never reproduced locally.** I had marked the LangChain packages as external, which left Vercel's file tracing to copy them into the function. It missed part of the dependency graph, so the route failed to import before any of my code ran. Letting Next bundle them fixed it. I also moved the agent import inside the handler so a future load failure produces a readable message instead of a blank 500.

**Gemini's free tier bills per model per day, not just per minute.** Full Flash allows 20 requests a day and one teardown uses 15 to 20, so runs died partway through. I switched to the flash lite alias, which has a much higher daily ceiling, and added a shared token bucket with backoff retry because the agent naturally bursts. I also moved off pinned model versions after `gemini-2.5-flash` started returning "no longer available to new users" for newly created keys.

## Tradeoffs

**Gemini free tier.** Chosen so you can test the deployed app without me shipping a paid key. The cost is the daily and per minute ceilings above, plus weaker long horizon reasoning. The harness design absorbs that, since a lite model is fine when it is orchestrating tools rather than recalling facts. A paid key removes the ceiling without changing anything.

**The agent runs inside the Next.js app, not as a separate service.** One deployment, one set of secrets, and the run streams straight to the browser. The limit is the serverless execution ceiling. A run that needed ten minutes, or that had to survive a page refresh, would need a queue and a worker with LangGraph checkpointing.

**A seven page sample instead of a full crawl.** Deep crawls do not fit in a serverless request. The mitigation is the classify everything, fetch a sample split described above.

**No rank or traffic data.** There is no free API for legal SERP positions, and inventing numbers would defeat the point of the product. It reports what it can measure on the site and stays quiet about rankings.

**Page classification is URL pattern based.** It is heuristic, and it misses some conventions. Spanish language URL paths on one test site fell into "other".

## Time

Roughly `<X>` hours, most of it on the deterministic audit layer and on chasing the two data correctness bugs above rather than on the agent wiring.

## What I would build next

1. **Competitor delta.** The finding that actually sells is "the three firms ranking above you average 1,400 words, you have 180". That needs a SERP source such as DataForSEO, and it is the single biggest upgrade to output quality.
2. **Durable runs.** A queue plus LangGraph checkpointing so a run survives a refresh and resumes instead of restarting.
3. **PDF export.** Agencies want to attach the teardown, and it already renders as a document, so this is mostly print styling.
4. **Approval before send.** `deepagents` supports interrupts, so pausing on the outreach draft for a human yes or no is a natural fit.
5. **Batch mode.** Feed a list of firms, rank by opportunity size, work the list.
