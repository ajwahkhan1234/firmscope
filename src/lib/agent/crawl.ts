/**
 * Deterministic crawling + parsing for law firm sites.
 *
 * Design note: everything measurable is measured here, in code — not by the
 * model. The LLM never guesses a word count, a status code, or whether schema
 * exists. It only reasons over facts this module produced. That keeps the
 * teardown defensible and makes the same URL produce the same numbers twice.
 */

import * as cheerio from "cheerio";
import type {
  CrawlResult,
  DiscoveredInventory,
  PageRecord,
  PageType,
} from "./types";
import { normalizeUrl } from "./url";

const UA =
  "Mozilla/5.0 (compatible; FirmScopeBot/1.0; +https://firmscope.app/bot) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const FETCH_TIMEOUT_MS = 12_000;

export { normalizeUrl } from "./url";

interface DocResponse {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  ttfbMs: number;
  contentType: string;
  error?: string;
}

export async function fetchDoc(url: string): Promise<DocResponse> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ttfbMs = Date.now() - started;
    const contentType = res.headers.get("content-type") ?? "";
    // Only read the body for HTML/XML; avoid pulling down PDFs or media.
    const html =
      contentType.includes("html") || contentType.includes("xml")
        ? await res.text()
        : "";
    return {
      ok: res.ok,
      status: res.status,
      html,
      finalUrl: res.url || url,
      ttfbMs,
      contentType,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      html: "",
      finalUrl: url,
      ttfbMs: Date.now() - started,
      contentType: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/** Normalize a phone string to digits so we can compare across pages. */
export function phoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/**
 * Practice-area vocabulary, matched per path segment. Kept broad because
 * firm URL conventions vary wildly between website vendors.
 */
const PRACTICE_RE =
  /(personal-injury|car-accident|auto-accident|truck-accident|18-wheeler|semi-truck|motorcycle-accident|pedestrian-accident|bicycle-accident|slip-and-fall|premises-liability|wrongful-death|medical-malpractice|birth-injury|nursing-home|workers-comp|work-injury|construction-accident|dog-bite|product-liability|brain-injury|spinal-cord|burn-injury|catastrophic|maritime|jones-act|mass-tort|class-action|divorce|family-law|child-custody|child-support|spousal-support|adoption|criminal-defense|dui|dwi|drug-charge|assault|theft|expunge|immigration|visa|green-card|deportation|asylum|citizenship|estate-planning|probate|wills|trusts|elder-law|bankruptcy|chapter-7|chapter-13|foreclosure|employment-law|discrimination|harassment|wrongful-termination|wage-and-hour|real-estate-law|business-law|contract-dispute|social-security-disability|veterans-disability|insurance-claim|bad-faith)/;

/** Section roots that mean "this is a blog post", regardless of the slug. */
const BLOG_ROOT_RE = /^(blog|news|articles?|insights?|resources?|posts?|category|tag|author|press|media)$/;

function classifyPage(url: string, title: string | null): PageRecord["pageType"] {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  path = path.replace(/\/+$/, "");
  if (path === "" || path === "/") return "home";

  const segs = path.split("/").filter(Boolean);
  const first = segs[0] ?? "";

  // Blog is checked first and by section root only. Otherwise a post titled
  // "what-to-do-about-a-car-accident" gets misfiled as a practice-area page.
  if (BLOG_ROOT_RE.test(first)) return "blog";

  if (/^(contact|contact-us|get-in-touch|free-consultation|free-case-review|schedule|book|consultation)/.test(first))
    return "contact";

  if (/^(attorneys?|lawyers?|our-attorneys|our-lawyers|our-team|meet-the-team|team|staff|people|profiles?|bios?|partners)$/.test(first))
    return "attorney-bio";

  if (/^(results|verdicts|settlements|case-results|our-results|recoveries|success-stories|wins)/.test(first))
    return "results";

  if (/^(about|about-us|who-we-are|our-firm|the-firm|firm-overview|why-us|why-choose-us)/.test(first))
    return "about";

  if (/^(practice-areas?|areas-of-practice|services|what-we-do|legal-services)$/.test(first))
    return "practice-area";

  // Any segment naming a practice makes this a money page.
  if (segs.some((seg) => PRACTICE_RE.test(seg))) return "practice-area";
  if (/^(practice-areas?|areas-of-practice|services)/.test(first)) return "practice-area";

  // Fallback on the title: "Houston Truck Accident Lawyer | Firm" style pages.
  const t = (title ?? "").toLowerCase();
  if (/\b(lawyer|attorney|law firm)\b/.test(t) && /\b(in|near|serving)\b/.test(t))
    return "practice-area";

  return "other";
}

export function parsePage(
  url: string,
  html: string,
  status: number,
  ttfbMs: number,
): PageRecord {
  const $ = cheerio.load(html);

  // Strip non-content nodes before measuring text.
  $("script, style, noscript, svg, iframe").remove();

  const title = $("head title").first().text().trim() || null;
  const metaDescription =
    $('head meta[name="description"]').attr("content")?.trim() ?? null;
  const canonical = $('head link[rel="canonical"]').attr("href")?.trim() ?? null;
  const robotsMeta = $('head meta[name="robots"]').attr("content")?.trim() ?? null;

  const h1s = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  // JSON-LD is re-read from the original html because we removed <script>.
  const jsonLdTypes = extractJsonLdTypes(html);

  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    /* ignore */
  }

  const internalLinks = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter((href) => {
      if (href.startsWith("/") && !href.startsWith("//")) return true;
      return origin ? href.startsWith(origin) : false;
    }).length;

  const phones = Array.from(
    new Set((bodyText.match(PHONE_RE) ?? []).map(phoneDigits).filter((p) => p.length === 10)),
  );

  return {
    url,
    status,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    h1s,
    wordCount,
    pageType: classifyPage(url, title),
    jsonLdTypes,
    internalLinks,
    excerpt: bodyText.slice(0, 1200),
    phones,
    ttfbMs,
  };
}

/** Pull @type values out of every JSON-LD block, including @graph nodes. */
export function extractJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      collectTypes(parsed, types);
    } catch {
      /* malformed JSON-LD is itself a finding, handled by the schema tool */
    }
  });
  return Array.from(new Set(types));
}

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") out.push(v);
    if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], out);
  }
}

/** Return every parsed JSON-LD object found on the page (flattened). */
export function extractJsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      flatten(JSON.parse(raw), out);
    } catch {
      /* ignore */
    }
  });
  return out;
}

function flatten(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) {
      flatten(obj["@graph"], out);
      return;
    }
    out.push(obj);
  }
}

function extractFirmName(html: string, host: string): string | null {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (og) return og;

  for (const obj of extractJsonLdObjects(html)) {
    const t = obj["@type"];
    const isOrg =
      (typeof t === "string" && /Organization|LegalService|Attorney|LocalBusiness/.test(t)) ||
      (Array.isArray(t) &&
        t.some((x) => typeof x === "string" && /Organization|LegalService|Attorney|LocalBusiness/.test(x)));
    if (isOrg && typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
  }

  const title = $("head title").first().text().trim();
  if (title) {
    // Titles are usually "Practice | Firm Name" or "Firm Name - Tagline".
    const parts = title.split(/[|–—-]/).map((p) => p.trim()).filter(Boolean);
    const firmish = parts.find((p) => /law|legal|attorney|associates|llp|llc|firm|p\.?c\.?/i.test(p));
    if (firmish) return firmish;
    if (parts.length) return parts[parts.length - 1];
  }
  return host;
}

function extractLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)).map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}

/** Lower rank = read this child sitemap first. */
function childSitemapRank(url: string): number {
  const u = url.toLowerCase();
  if (/(page|practice|service|attorney|lawyer|team|location)/.test(u)) return 0;
  if (/(post|blog|news|category|tag|author)/.test(u)) return 3;
  return 1;
}

/** Discover candidate URLs from the sitemap, falling back to homepage links. */
async function discoverUrls(
  origin: string,
  homepageHtml: string,
): Promise<{ urls: string[]; sitemapFound: boolean; sitemapUrlCount: number }> {
  const found: string[] = [];
  let sitemapFound = false;
  let sitemapUrlCount = 0;

  const sitemapRes = await fetchDoc(`${origin}/sitemap.xml`);
  if (sitemapRes.ok && sitemapRes.html.includes("<loc")) {
    sitemapFound = true;
    let locs = extractLocs(sitemapRes.html);

    // Sitemap index: WordPress/legal-vendor sites split into page-sitemap,
    // post-sitemap, attorney-sitemap, etc. Reading only the first child is how
    // you end up auditing 200 blog posts and zero practice-area pages, so pull
    // several children and rank the useful ones first.
    if (sitemapRes.html.includes("<sitemapindex")) {
      const children = [...locs].sort(
        (a, b) => childSitemapRank(a) - childSitemapRank(b),
      );
      const picked = children.slice(0, 4);
      const childDocs = await Promise.all(picked.map((c) => fetchDoc(c)));
      const merged: string[] = [];
      for (const doc of childDocs) {
        if (doc.ok && doc.html) merged.push(...extractLocs(doc.html));
      }
      if (merged.length) locs = merged;
    }

    // Guard against enormous sitemaps; we only need a diagnostic sample.
    sitemapUrlCount = locs.length;
    found.push(...locs.slice(0, 3000));
  }

  if (found.length === 0) {
    const $ = cheerio.load(homepageHtml);
    const links = $("a[href]")
      .map((_, el) => $(el).attr("href") ?? "")
      .get();
    for (const href of links) {
      try {
        const abs = new URL(href, origin);
        if (abs.origin === origin) found.push(abs.toString().split("#")[0]);
      } catch {
        /* skip */
      }
    }
  }

  return { urls: Array.from(new Set(found)), sitemapFound, sitemapUrlCount };
}

const ALL_PAGE_TYPES: PageType[] = [
  "home",
  "practice-area",
  "attorney-bio",
  "contact",
  "about",
  "results",
  "blog",
  "other",
];

function isAssetUrl(url: string): boolean {
  return /\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|docx?|xml)$/i.test(url);
}

/**
 * Classify every discovered URL without fetching it, so existence checks can
 * see the whole site rather than only the pages we had budget to fetch.
 */
function buildInventory(urls: string[], origin: string): DiscoveredInventory {
  const byType = {} as Record<PageType, number>;
  const samples = {} as Record<PageType, string[]>;
  for (const t of ALL_PAGE_TYPES) {
    byType[t] = 0;
    samples[t] = [];
  }

  let total = 0;
  for (const url of urls) {
    if (isAssetUrl(url)) continue;
    try {
      if (new URL(url).origin !== origin) continue;
    } catch {
      continue;
    }
    total += 1;
    const type = classifyPage(url, null);
    byType[type] += 1;
    if (samples[type].length < 5) samples[type].push(url);
  }

  return { total, byType, samples };
}

/**
 * Pick the most diagnostic pages rather than the first N. We want coverage
 * across archetypes because the teardown scores each archetype separately.
 */
function selectPages(urls: string[], origin: string, budget: number): string[] {
  const wanted: PageRecord["pageType"][] = [
    "practice-area",
    "attorney-bio",
    "contact",
    "results",
    "about",
    "blog",
  ];
  const buckets = new Map<string, string[]>();

  for (const url of urls) {
    if (url === origin || url === `${origin}/`) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|docx?)$/i.test(url)) continue;
    const type = classifyPage(url, null);
    const list = buckets.get(type) ?? [];
    list.push(url);
    buckets.set(type, list);
  }

  const depth = (u: string) => {
    try {
      return new URL(u).pathname.replace(/\/+$/, "").split("/").filter(Boolean).length;
    } catch {
      return 99;
    }
  };

  const picked: string[] = [];

  // Practice-area pages are the money pages; take up to 3, shallowest first so
  // we sample the main service pages rather than three sibling sub-pages.
  const practice = [...(buckets.get("practice-area") ?? [])].sort(
    (a, b) => depth(a) - depth(b) || a.length - b.length,
  );
  picked.push(...practice.slice(0, 3));

  for (const type of wanted) {
    if (type === "practice-area") continue;
    const list = buckets.get(type) ?? [];
    if (!list.length) continue;

    if (type === "attorney-bio") {
      // An individual bio tells us about credential depth; the index page does
      // not. Prefer a nested URL, fall back to whatever exists.
      const individual = list.find((u) => depth(u) >= 2);
      picked.push(individual ?? list[0]);
    } else {
      picked.push([...list].sort((a, b) => depth(a) - depth(b))[0]);
    }
  }

  if (picked.length < budget) {
    const other = buckets.get("other") ?? [];
    picked.push(...other.slice(0, budget - picked.length));
  }

  return Array.from(new Set(picked)).slice(0, budget);
}

export async function crawlFirmSite(
  inputUrl: string,
  maxPages = 7,
): Promise<CrawlResult> {
  const startUrl = normalizeUrl(inputUrl);
  const errors: string[] = [];

  const home = await fetchDoc(startUrl);
  if (!home.html) {
    throw new Error(
      `Could not fetch ${startUrl}${home.error ? ` — ${home.error}` : ` (HTTP ${home.status})`}. The site may be down, blocking bots, or the URL may be wrong.`,
    );
  }

  const finalUrl = home.finalUrl;
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).hostname;

  const robots = await fetchDoc(`${origin}/robots.txt`);
  const robotsBody = robots.status === 200 ? robots.html : "";
  const robotsBlocksAll = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(\n|$)/i.test(
    robotsBody,
  );

  const { urls, sitemapFound, sitemapUrlCount } = await discoverUrls(origin, home.html);
  const discovered = buildInventory(urls, origin);
  const selected = selectPages(urls, origin, maxPages - 1);

  const pages: PageRecord[] = [
    parsePage(finalUrl, home.html, home.status, home.ttfbMs),
  ];
  pages[0].pageType = "home";

  // Fetch selected pages with limited concurrency to stay polite and fast.
  const results = await Promise.all(
    selected.map(async (url) => {
      const res = await fetchDoc(url);
      if (!res.html) {
        errors.push(`${url} → ${res.error ?? `HTTP ${res.status}`}`);
        return null;
      }
      return parsePage(res.finalUrl, res.html, res.status, res.ttfbMs);
    }),
  );

  for (const r of results) if (r) pages.push(r);

  return {
    origin,
    finalUrl,
    firmName: extractFirmName(home.html, host),
    pages,
    discovered,
    sitemapFound,
    sitemapUrlCount,
    robotsTxtFound: robots.status === 200,
    robotsBlocksAll,
    https: finalUrl.startsWith("https://"),
    redirectedToWww: new URL(finalUrl).hostname.startsWith("www."),
    errors,
  };
}
