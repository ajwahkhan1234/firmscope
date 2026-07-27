/**
 * Deterministic audits. Each function consumes a CrawlResult and emits
 * Signals — literal, reproducible observations. No LLM involvement.
 *
 * Weights encode law-firm-specific priorities (see knowledge.ts), not generic
 * SEO weighting. Missing Attorney schema matters more here than it would for
 * an e-commerce site; a missing click-to-call matters far more than usual
 * because legal intent converts by phone.
 */

import { extractJsonLdObjects, fetchDoc, phoneDigits } from "./crawl";
import type { CrawlResult, PageRecord, Signal } from "./types";

function s(
  key: string,
  category: Signal["category"],
  passed: boolean,
  weight: number,
  detail: string,
  url?: string,
): Signal {
  return { key, category, passed, weight, detail, url };
}

/* ------------------------------------------------------------------ */
/* Technical                                                           */
/* ------------------------------------------------------------------ */

export function auditTechnical(crawl: CrawlResult): Signal[] {
  const out: Signal[] = [];
  const home = crawl.pages[0];

  out.push(
    s(
      "tech.https",
      "technical",
      crawl.https,
      8,
      crawl.https
        ? "Site serves over HTTPS."
        : "Site does not serve over HTTPS — browsers flag it as 'Not secure', which is fatal for a firm asking for case details.",
      crawl.finalUrl,
    ),
  );

  out.push(
    s(
      "tech.robots_txt",
      "technical",
      crawl.robotsTxtFound,
      3,
      crawl.robotsTxtFound
        ? "robots.txt is present."
        : "No robots.txt found at the site root.",
    ),
  );

  out.push(
    s(
      "tech.robots_blocks_all",
      "technical",
      !crawl.robotsBlocksAll,
      10,
      crawl.robotsBlocksAll
        ? "robots.txt contains a site-wide Disallow: / — the site is telling Google not to crawl it at all."
        : "robots.txt does not block crawling site-wide.",
    ),
  );

  out.push(
    s(
      "tech.sitemap",
      "technical",
      crawl.sitemapFound,
      6,
      crawl.sitemapFound
        ? `XML sitemap found listing ${crawl.sitemapUrlCount} URLs.`
        : "No XML sitemap at /sitemap.xml — Google is left to discover pages by crawling links alone.",
    ),
  );

  const slow = crawl.pages.filter((p) => p.ttfbMs > 1500);
  out.push(
    s(
      "tech.response_time",
      "technical",
      slow.length === 0,
      6,
      slow.length === 0
        ? `Server responded in under 1.5s on all ${crawl.pages.length} pages tested (homepage ${home.ttfbMs}ms).`
        : `${slow.length} of ${crawl.pages.length} pages took over 1.5s to respond (slowest ${Math.max(
            ...slow.map((p) => p.ttfbMs),
          )}ms). Slow server response caps Core Web Vitals no matter what else is optimized.`,
    ),
  );

  const noindexed = crawl.pages.filter((p) => /noindex/i.test(p.robotsMeta ?? ""));
  out.push(
    s(
      "tech.noindex",
      "technical",
      noindexed.length === 0,
      9,
      noindexed.length === 0
        ? "No pages carry a noindex directive."
        : `${noindexed.length} page(s) carry meta robots noindex and cannot rank: ${noindexed
            .map((p) => p.url)
            .join(", ")}`,
    ),
  );

  const missingCanonical = crawl.pages.filter((p) => !p.canonical);
  out.push(
    s(
      "tech.canonical",
      "technical",
      missingCanonical.length === 0,
      4,
      missingCanonical.length === 0
        ? "All tested pages declare a canonical URL."
        : `${missingCanonical.length} of ${crawl.pages.length} tested pages have no canonical tag, leaving duplicate URL variants unconsolidated.`,
    ),
  );

  const badStatus = crawl.pages.filter((p) => p.status >= 400);
  out.push(
    s(
      "tech.status_codes",
      "technical",
      badStatus.length === 0,
      7,
      badStatus.length === 0
        ? "All tested pages returned a successful status."
        : `${badStatus.length} tested page(s) returned an error status.`,
    ),
  );

  return out;
}

/* ------------------------------------------------------------------ */
/* On-page / content structure                                         */
/* ------------------------------------------------------------------ */

export function auditContent(crawl: CrawlResult): Signal[] {
  const out: Signal[] = [];
  const pages = crawl.pages;

  const missingTitle = pages.filter((p) => !p.title || p.title.length < 10);
  out.push(
    s(
      "content.titles",
      "content",
      missingTitle.length === 0,
      7,
      missingTitle.length === 0
        ? "Every tested page has a title tag."
        : `${missingTitle.length} tested page(s) have a missing or near-empty title tag.`,
    ),
  );

  const longTitles = pages.filter((p) => (p.title?.length ?? 0) > 65);
  out.push(
    s(
      "content.title_length",
      "content",
      longTitles.length <= 1,
      3,
      longTitles.length <= 1
        ? "Title lengths are within the range Google displays."
        : `${longTitles.length} titles exceed 65 characters and will be truncated in results.`,
    ),
  );

  const missingMeta = pages.filter((p) => !p.metaDescription);
  out.push(
    s(
      "content.meta_descriptions",
      "content",
      missingMeta.length === 0,
      4,
      missingMeta.length === 0
        ? "All tested pages have meta descriptions."
        : `${missingMeta.length} of ${pages.length} tested pages have no meta description, so Google writes the snippet for them.`,
    ),
  );

  const badH1 = pages.filter((p) => p.h1s.length !== 1);
  out.push(
    s(
      "content.h1",
      "content",
      badH1.length === 0,
      4,
      badH1.length === 0
        ? "Every tested page has exactly one H1."
        : `${badH1.length} tested page(s) have zero or multiple H1s.`,
    ),
  );

  // Existence reads the full discovered inventory; depth reads the fetched
  // sample. Conflating the two produces false "they have no blog" findings.
  const discoveredPractice = crawl.discovered.byType["practice-area"];
  const practice = pages.filter((p) => p.pageType === "practice-area");
  const thinPractice = practice.filter((p) => p.wordCount < 400);

  out.push(
    s(
      "content.practice_pages_exist",
      "content",
      discoveredPractice > 0,
      10,
      discoveredPractice > 0
        ? `${discoveredPractice} dedicated practice-area page(s) found across the site.`
        : "No dedicated practice-area pages were found anywhere on the site. The firm appears to be relying on its homepage to rank for every service it offers, which cannot work for competitive legal keywords.",
    ),
  );

  if (practice.length > 0) {
    out.push(
      s(
        "content.practice_depth",
        "content",
        thinPractice.length === 0,
        9,
        thinPractice.length === 0
          ? `The ${practice.length} practice-area page(s) sampled average ${Math.round(
              practice.reduce((a, p) => a + p.wordCount, 0) / practice.length,
            )} words — enough depth to compete.`
          : `${thinPractice.length} of the ${practice.length} practice-area page(s) sampled are under 400 words (thinnest: ${Math.min(
              ...thinPractice.map((p) => p.wordCount),
            )} words at ${thinPractice[0].url}). Ranking pages in competitive legal markets typically run 800-1,500 words.`,
        thinPractice[0]?.url,
      ),
    );
  }

  const discoveredBlog = crawl.discovered.byType.blog;
  out.push(
    s(
      "content.blog",
      "content",
      discoveredBlog > 0,
      4,
      discoveredBlog > 0
        ? `The site publishes ongoing content (${discoveredBlog} blog/resource URLs found).`
        : "No blog or resources section was found — the firm has no vehicle for capturing informational legal queries, which is where most AI-search citations originate.",
    ),
  );

  const home = pages[0];
  out.push(
    s(
      "content.home_depth",
      "content",
      home.wordCount >= 300,
      3,
      home.wordCount >= 300
        ? `Homepage carries ${home.wordCount} words of copy.`
        : `Homepage has only ${home.wordCount} words of text — too little for Google to understand what the firm does or where.`,
    ),
  );

  return out;
}

/* ------------------------------------------------------------------ */
/* Schema / structured data                                            */
/* ------------------------------------------------------------------ */

export interface SchemaAudit {
  signals: Signal[];
  typesFound: string[];
  orgFieldsPresent: string[];
  orgFieldsMissing: string[];
}

const ORG_REQUIRED = [
  "name",
  "address",
  "telephone",
  "url",
  "areaServed",
  "sameAs",
  "openingHoursSpecification",
];

export async function auditSchema(crawl: CrawlResult): Promise<SchemaAudit> {
  const out: Signal[] = [];
  const home = crawl.pages[0];

  // Re-fetch the homepage HTML to inspect full JSON-LD objects (PageRecord
  // only retains the @type list).
  const homeDoc = await fetchDoc(home.url);
  const objects = homeDoc.html ? extractJsonLdObjects(homeDoc.html) : [];

  const allTypes = new Set<string>();
  for (const p of crawl.pages) for (const t of p.jsonLdTypes) allTypes.add(t);

  const hasLegalEntity = Array.from(allTypes).some((t) =>
    /LegalService|Attorney|LawFirm/i.test(t),
  );
  const hasLocalBusiness = Array.from(allTypes).some((t) =>
    /LocalBusiness|Organization/i.test(t),
  );

  out.push(
    s(
      "schema.legal_entity",
      "local",
      hasLegalEntity,
      9,
      hasLegalEntity
        ? `Legal-specific structured data present (${Array.from(allTypes)
            .filter((t) => /LegalService|Attorney|LawFirm/i.test(t))
            .join(", ")}).`
        : hasLocalBusiness
          ? `The site uses generic ${Array.from(allTypes).filter((t) => /LocalBusiness|Organization/i.test(t)).join("/")} markup instead of LegalService or Attorney. Google cannot tell it is a law firm from the markup alone.`
          : "No LegalService, Attorney, or LocalBusiness structured data found anywhere on the site.",
      home.url,
    ),
  );

  // Field completeness on the org node — presence alone is not enough.
  const orgNode = objects.find((o) => {
    const t = o["@type"];
    const str = Array.isArray(t) ? t.join(" ") : String(t ?? "");
    return /LegalService|Attorney|LawFirm|LocalBusiness|Organization/i.test(str);
  });

  const present: string[] = [];
  const missing: string[] = [];
  if (orgNode) {
    for (const field of ORG_REQUIRED) {
      if (orgNode[field] !== undefined && orgNode[field] !== null && orgNode[field] !== "")
        present.push(field);
      else missing.push(field);
    }
  } else {
    missing.push(...ORG_REQUIRED);
  }

  out.push(
    s(
      "schema.org_completeness",
      "local",
      orgNode ? missing.length <= 2 : false,
      6,
      orgNode
        ? missing.length === 0
          ? "The business schema node is fully populated."
          : `The business schema node is missing ${missing.length} important field(s): ${missing.join(", ")}. Partial markup like this is common from themes and delivers little value.`
        : "No business schema node to evaluate for completeness.",
      home.url,
    ),
  );

  const bios = crawl.pages.filter((p) => p.pageType === "attorney-bio");
  const biosWithPerson = bios.filter((p) =>
    p.jsonLdTypes.some((t) => /Person|Attorney/i.test(t)),
  );
  out.push(
    s(
      "schema.attorney_person",
      "authority",
      // If no bio page made it into the sample we cannot judge this, so we
      // don't penalize it — absence of measurement is not evidence of failure.
      bios.length === 0 ? true : biosWithPerson.length > 0,
      6,
      bios.length === 0
        ? "No attorney bio page was available in the crawl sample to check for Person/Attorney markup."
        : biosWithPerson.length > 0
          ? `${biosWithPerson.length} of the ${bios.length} bio page(s) sampled carry Person/Attorney schema.`
          : `None of the ${bios.length} attorney bio page(s) sampled carry Person or Attorney schema — the strongest machine-readable credibility signal available in legal is unused.`,
      bios[0]?.url,
    ),
  );

  const hasFaq = Array.from(allTypes).some((t) => /FAQPage/i.test(t));
  out.push(
    s(
      "schema.faq",
      "content",
      hasFaq,
      4,
      hasFaq
        ? "FAQPage markup found — good positioning for AI Overviews and question queries."
        : "No FAQPage markup found. Legal queries are overwhelmingly question-shaped, and FAQ blocks are the format most often reused in AI Overviews and ChatGPT answers.",
    ),
  );

  const hasBreadcrumb = Array.from(allTypes).some((t) => /BreadcrumbList/i.test(t));
  out.push(
    s(
      "schema.breadcrumb",
      "technical",
      hasBreadcrumb,
      2,
      hasBreadcrumb
        ? "BreadcrumbList markup present."
        : "No BreadcrumbList markup, so the practice-area hierarchy is not machine-legible.",
    ),
  );

  return {
    signals: out,
    typesFound: Array.from(allTypes),
    orgFieldsPresent: present,
    orgFieldsMissing: missing,
  };
}

/* ------------------------------------------------------------------ */
/* Local / NAP                                                         */
/* ------------------------------------------------------------------ */

export interface NapAudit {
  signals: Signal[];
  phonesByPage: { url: string; phones: string[] }[];
  distinctPhones: string[];
}

export function auditNap(crawl: CrawlResult): NapAudit {
  const out: Signal[] = [];
  const phonesByPage = crawl.pages.map((p) => ({ url: p.url, phones: p.phones }));
  const distinct = Array.from(new Set(crawl.pages.flatMap((p) => p.phones)));

  const pagesWithPhone = crawl.pages.filter((p) => p.phones.length > 0);

  out.push(
    s(
      "local.phone_present",
      "local",
      pagesWithPhone.length > 0,
      9,
      pagesWithPhone.length > 0
        ? `A phone number appears on ${pagesWithPhone.length} of ${crawl.pages.length} tested pages.`
        : "No phone number was found in the page text on any tested page. For a practice where most high-intent contact is a phone call, this is a direct revenue leak.",
    ),
  );

  out.push(
    s(
      "local.nap_consistency",
      "local",
      distinct.length <= 1,
      7,
      distinct.length <= 1
        ? "A single consistent phone number is used across the site."
        : `${distinct.length} different phone numbers appear across the site (${distinct
            .map((d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`)
            .join(", ")}). Inconsistent NAP data across the site and directories is one of the most common causes of weak local pack placement in legal.`,
    ),
  );

  const contactPage = crawl.pages.find((p) => p.pageType === "contact");
  const discoveredContact = crawl.discovered.byType.contact;
  out.push(
    s(
      "local.contact_page",
      "conversion",
      discoveredContact > 0,
      5,
      discoveredContact > 0
        ? `Dedicated contact page found at ${contactPage?.url ?? crawl.discovered.samples.contact[0]}.`
        : "No dedicated contact page was found anywhere on the site, which weakens both local relevance and intake.",
      contactPage?.url ?? crawl.discovered.samples.contact[0],
    ),
  );

  return { signals: out, phonesByPage, distinctPhones: distinct };
}

/* ------------------------------------------------------------------ */
/* Conversion / intake                                                 */
/* ------------------------------------------------------------------ */

export async function auditConversion(crawl: CrawlResult): Promise<Signal[]> {
  const out: Signal[] = [];
  const home = crawl.pages[0];

  const homeDoc = await fetchDoc(home.url);
  const html = homeDoc.html;

  const hasTelLink = /href\s*=\s*["']tel:/i.test(html);
  out.push(
    s(
      "conv.click_to_call",
      "conversion",
      hasTelLink,
      9,
      hasTelLink
        ? "Click-to-call (tel:) link present on the homepage."
        : "The homepage has no tel: click-to-call link. Over half of legal searches happen on mobile, and a phone number that is not tappable loses calls that were already earned.",
      home.url,
    ),
  );

  const hasForm = /<form[\s>]/i.test(html);
  const formFields = (html.match(/<input[^>]+type=["'](?!hidden|submit|button)/gi) ?? [])
    .length;
  out.push(
    s(
      "conv.form_present",
      "conversion",
      hasForm,
      6,
      hasForm
        ? `Contact form present on the homepage with roughly ${formFields} visible field(s).`
        : "No contact form on the homepage — visitors who will not call have no way to convert.",
      home.url,
    ),
  );

  if (hasForm) {
    out.push(
      s(
        "conv.form_length",
        "conversion",
        formFields <= 5,
        4,
        formFields <= 5
          ? `Intake form is short (${formFields} fields), which is right for legal intake.`
          : `The homepage intake form has roughly ${formFields} visible fields. Every field past name/phone/case-description measurably reduces submissions.`,
        home.url,
      ),
    );
  }

  const freeConsult = /free\s+(case\s+)?(consultation|review|evaluation)|no\s+fee\s+unless|pay\s+nothing\s+unless/i.test(
    html,
  );
  out.push(
    s(
      "conv.free_consult",
      "conversion",
      freeConsult,
      5,
      freeConsult
        ? "Free consultation / contingency framing is present on the homepage."
        : "No free-consultation or contingency ('no fee unless we win') framing was found on the homepage. This is the single strongest conversion lever in most consumer legal practices.",
      home.url,
    ),
  );

  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  out.push(
    s(
      "conv.mobile_viewport",
      "technical",
      viewport,
      7,
      viewport
        ? "Mobile viewport meta tag present."
        : "No mobile viewport meta tag — the site will render as a desktop page on phones.",
      home.url,
    ),
  );

  return out;
}

/* ------------------------------------------------------------------ */
/* Authority / E-E-A-T structure                                       */
/* ------------------------------------------------------------------ */

export function auditAuthority(crawl: CrawlResult): Signal[] {
  const out: Signal[] = [];
  const bios = crawl.pages.filter((p) => p.pageType === "attorney-bio");
  const discoveredBios = crawl.discovered.byType["attorney-bio"];
  const discoveredResults = crawl.discovered.byType.results;

  out.push(
    s(
      "authority.bios_exist",
      "authority",
      discoveredBios > 0,
      8,
      discoveredBios > 0
        ? `${discoveredBios} attorney bio page(s) found across the site.`
        : "No attorney bio pages were found anywhere on the site. Legal is maximum-severity YMYL — Google's raters look for real, credentialed humans, and an anonymous firm site is capped on trust.",
    ),
  );

  if (bios.length > 0) {
    const thinBios = bios.filter((p) => p.wordCount < 250);
    out.push(
      s(
        "authority.bio_depth",
        "authority",
        thinBios.length === 0,
        6,
        thinBios.length === 0
          ? `The ${bios.length} bio page(s) sampled average ${Math.round(
              bios.reduce((a, p) => a + p.wordCount, 0) / bios.length,
            )} words.`
          : `${thinBios.length} of the ${bios.length} bio page(s) sampled are under 250 words (thinnest ${Math.min(
              ...thinBios.map((p) => p.wordCount),
            )} words). A short bio with a headshot does not establish expertise — bar admissions, law school, case history, and associations do.`,
        thinBios[0]?.url,
      ),
    );
  }

  out.push(
    s(
      "authority.case_results",
      "authority",
      discoveredResults > 0,
      5,
      discoveredResults > 0
        ? `A case results / verdicts section was found (${discoveredResults} URL(s)).`
        : "No case results or verdicts section was found. Verifiable outcomes are among the strongest trust signals in legal.",
    ),
  );

  return out;
}
