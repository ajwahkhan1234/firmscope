/**
 * FirmScope domain knowledge base.
 *
 * This is the agent's "expertise". It is deliberately stored as retrievable
 * chunks rather than crammed into the system prompt so that:
 *   - the system prompt stays small (cheaper, less drift on a free-tier model)
 *   - the agent must *decide* what expertise a given finding needs
 *   - we can show, in the run timeline, which playbook the agent consulted
 *
 * Content is specific to US law-firm SEO. Generic SEO advice is intentionally
 * excluded — the whole point is that this agent knows things a general
 * SEO tool would not.
 */

export interface PlaybookEntry {
  topic: string;
  summary: string;
  body: string;
  /** Free-text tags used for lookup matching. */
  tags: string[];
}

export const PLAYBOOK: PlaybookEntry[] = [
  {
    topic: "local-pack-ranking",
    summary:
      "How the Google local pack ranks law firms, and why proximity dominates.",
    tags: ["local", "gbp", "map pack", "nap", "google business profile", "reviews"],
    body: `Legal is one of the most proximity-weighted verticals in the local pack. Ranking is driven by:

1. **Proximity to searcher** — the single heaviest factor, and the one a firm cannot buy. This is why multi-location firms with a real staffed office in each city beat single-office firms bidding on city keywords.
2. **Primary GBP category** — must be the *specific* practice ("Personal Injury Attorney", "Divorce Lawyer"), not the generic "Law Firm". Using the generic category is one of the most common and most expensive mistakes; it removes the firm from the specific-practice pack entirely.
3. **NAP consistency** — Name/Address/Phone must be byte-identical across the website footer, GBP, Avvo, Justia, FindLaw, Yelp, and the state bar directory. Legal has an unusually messy citation landscape because of legacy directory spam, so inconsistency is common.
4. **Review velocity and recency**, not just count. A firm with 40 reviews earned steadily beats one with 120 reviews from three years ago. Reviews containing the practice keyword ("he handled my truck accident case") carry additional weight.
5. **Landing page relevance** — the page the GBP points at should be the city+practice page, not the homepage.

A tracked phone number (call-tracking) placed in the GBP without also being the number in the website footer is a classic self-inflicted NAP break.`,
  },
  {
    topic: "practice-area-architecture",
    summary:
      "The page architecture that actually ranks for legal service queries.",
    tags: ["content", "practice area", "architecture", "silo", "pages", "thin"],
    body: `Law firm sites almost always fail on architecture rather than on writing quality. The pattern that works:

- **One page per practice area per city.** "Car Accident Lawyer in Houston" is a different page from "Truck Accident Lawyer in Houston" and from "Car Accident Lawyer in Katy". Firms that fold these into one "Personal Injury" page cannot rank for any of them.
- **Sub-practice depth.** A ranking personal-injury silo has parent "Personal Injury" plus children: car accident, truck accident, motorcycle, slip and fall, wrongful death, premises liability. Competitors who have this depth win on long-tail volume that converts far better than the head term.
- **Minimum viable depth is ~800-1200 words** of genuinely specific content — statute of limitations for that state, damage caps, comparative-negligence rules, what the firm actually does in the first 30 days. Under ~400 words the page reads as doorway content and gets filtered.
- **Internal linking**: every sub-practice links up to the parent and laterally to siblings. Most firm sites have practice pages that are orphaned except from the nav dropdown.
- **The homepage should not be the ranking target** for any money keyword. If a firm's homepage is the only page ranking, its architecture is broken.

Red flag to look for: a nav listing 12 practice areas where every link goes to a page under 400 words. That is a template dump, and it actively suppresses the whole site.`,
  },
  {
    topic: "legal-schema",
    summary:
      "Structured data that matters for law firms, and what most firms get wrong.",
    tags: ["schema", "json-ld", "structured data", "attorney", "legalservice", "rich results"],
    body: `The schema types that matter for a law firm, in priority order:

1. **LegalService** (or the more specific \`Attorney\`) on the homepage and contact page, with \`name\`, \`address\` (full PostalAddress), \`telephone\`, \`areaServed\`, \`priceRange\`, \`openingHoursSpecification\`, and \`sameAs\` pointing at GBP, Avvo, Justia, and LinkedIn. This is the single highest-value markup and most firms either omit it or ship an empty \`LocalBusiness\` stub from a theme.
2. **Attorney** or \`Person\` on each bio page, with \`alumniOf\`, \`memberOf\` (bar associations), \`award\`, \`knowsAbout\`. This is the strongest machine-readable E-E-A-T signal available in legal, and almost nobody implements it.
3. **FAQPage** on practice-area pages — legal queries are overwhelmingly question-shaped, and FAQ blocks are heavily reused in AI Overviews and ChatGPT answers.
4. **BreadcrumbList** to make the practice silo legible.

What firms get wrong:
- \`aggregateRating\` self-serving markup on the org itself. Google ignores it and several state bars treat published ratings as regulated advertising. Do not recommend adding it.
- A theme-injected \`LocalBusiness\` with only \`@type\` and \`name\` — technically present, worth nothing. When auditing, check for *field completeness*, not merely presence.
- Schema in a \`<script>\` that only renders client-side after hydration. Verify it exists in the raw HTML.`,
  },
  {
    topic: "eeat-legal",
    summary:
      "E-E-A-T for YMYL legal content — what actually moves the needle.",
    tags: ["eeat", "e-e-a-t", "authority", "trust", "ymyl", "bio", "author"],
    body: `Legal is maximum-severity YMYL. Google applies its harshest quality thresholds here, which means trust signals are not optional polish — they are a ranking prerequisite.

The signals that matter:
- **Named attorney authorship on every substantive page**, linked to a real bio, with bar admission and years practicing. Content bylined "Admin" or unattributed is the most common failure and it caps the whole domain.
- **Bio pages with substance**: bar number and admission state, law school, reported case results, publications, speaking, associations. A 90-word bio with a headshot is not a bio.
- **Verifiable case results** with jurisdiction and case type. Note: most state bars require a disclaimer next to results ("Past results do not guarantee a similar outcome"). A firm publishing results *without* the disclaimer has a compliance problem, not just an SEO one — flag it as a risk, not as an opportunity.
- **Physical office proof** — real photos, not stock. Google's raters are explicitly instructed to look for evidence the business exists.
- **Off-site corroboration**: Avvo/Justia/Martindale profiles, bar directory listing, local press. The name and address on those must match the site exactly.

When evaluating a firm, weight "is there a real, credentialed human attached to this content" far above keyword usage. In legal, the former is the actual bottleneck.`,
  },
  {
    topic: "conversion-legal",
    summary:
      "Why legal traffic fails to convert, and the fixes that pay for themselves.",
    tags: ["conversion", "cro", "intake", "forms", "phone", "cta"],
    body: `A law firm's marketing bottleneck is usually intake, not traffic. Findings here often outrank pure SEO fixes on ROI.

- **Click-to-call must be present and above the fold on mobile.** Over 60% of legal searches are mobile and a large share of high-intent contacts are calls, not form fills. A phone number rendered as plain text rather than a \`tel:\` link is a direct revenue leak.
- **Response time is the entire game.** Firms that respond in under 5 minutes sign dramatically more cases than firms that respond in an hour. If the only contact path is a form that emails an unmonitored inbox, that is the finding.
- **Form length**: name, phone, and a one-line case description. Every additional field measurably reduces submissions. Case-type dropdowns with 15 options are common and harmful.
- **Free consultation framing** should be explicit and repeated. For contingency practices, "you pay nothing unless we win" belongs above the fold — but check state bar rules, since some jurisdictions require clarifying that costs may still be owed.
- **Live chat / after-hours coverage**: a meaningful share of personal-injury and criminal-defense inquiries arrive outside business hours.

When a firm has decent content but no click-to-call and a 9-field form, lead with that in outreach. It is cheap to fix and the improvement is attributable, which makes it an ideal opening engagement.`,
  },
  {
    topic: "technical-legal",
    summary:
      "Technical issues that disproportionately affect law firm sites.",
    tags: ["technical", "speed", "crawl", "indexing", "mobile", "core web vitals"],
    body: `Law firm sites cluster around a few technical failure modes, mostly inherited from legal-specific website vendors (FindLaw, Scorpion, Justia, LawLytics) and heavy WordPress themes:

- **Vendor-locked template bloat** — 4-6MB homepages with slider libraries and multiple font families. LCP over 4s on mobile is routine. This is worth flagging because the firm usually cannot fix it without leaving the vendor, which is itself the sales conversation.
- **Duplicate city pages** — vendors generate near-identical "Practice in {City}" pages at scale. These get treated as doorway pages. Look for many pages sharing near-identical titles.
- **Missing or stale XML sitemap** — vendor sitemaps frequently list pages that 404 or redirect.
- **Blog subdomains or third-party-hosted blogs** — splits authority away from the main domain.
- **Uncanonicalized www/non-www and http/https variants** — common on older firm domains.
- **JS-rendered navigation** — some vendor themes render the whole practice-area nav client-side, so internal links are invisible in raw HTML.

When auditing, always distinguish *fixable on the current platform* from *requires a replatform*. That distinction is the single most useful thing in an outreach email, because it tells the firm what they're actually buying.`,
  },
  {
    topic: "outreach-legal",
    summary:
      "How to write cold outreach to a managing partner that gets a reply.",
    tags: ["outreach", "email", "cold email", "sales", "partner"],
    body: `Managing partners get 20+ SEO pitches a week and delete all of them. What earns a reply:

- **Lead with one specific, verifiable observation about their site**, in the first sentence. Not "I was browsing your website and noticed some opportunities" — that is the delete trigger. Instead: "Your Houston truck accident page is 180 words; the three firms ranking above you average 1,400."
- **Translate to cases, not rankings.** Partners do not buy position 3. They buy signed cases. Frame as "this is roughly X missed inquiries a month" only if you can defend the estimate; otherwise frame directionally and honestly.
- **One finding, not twelve.** A list of 12 issues reads as a template. One sharp finding reads as someone who actually looked.
- **No jargon.** "Schema markup" means nothing to a partner. "Google can't tell which of your attorneys handles what" does.
- **Ask for a low-commitment next step** — a reply, not a 30-minute call on their calendar.
- **Keep it under 120 words.** Under 90 is better.
- **Never claim guaranteed results or use superlatives about their competitors' failures** — attorney advertising rules make partners allergic to unverifiable claims, and it signals you don't know the industry.

Subject lines that work are specific and low-drama: "your Houston truck accident page" beats "Boost Your Law Firm's SEO!".`,
  },
];

/** Naive but effective retrieval over the playbook. */
export function lookupPlaybook(query: string): PlaybookEntry[] {
  const q = query.toLowerCase();
  const terms = q.split(/[^a-z0-9-]+/).filter((t) => t.length > 2);

  const scored = PLAYBOOK.map((entry) => {
    let score = 0;
    if (entry.topic.includes(q)) score += 10;
    for (const tag of entry.tags) {
      if (q.includes(tag)) score += 5;
      for (const term of terms) if (tag.includes(term)) score += 2;
    }
    for (const term of terms) {
      if (entry.topic.includes(term)) score += 3;
      if (entry.summary.toLowerCase().includes(term)) score += 1;
    }
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Always return something useful rather than an empty result.
  if (scored.length === 0) return PLAYBOOK.slice(0, 2);
  return scored.slice(0, 2).map((s) => s.entry);
}
