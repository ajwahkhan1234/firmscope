/**
 * Deterministic-layer smoke test. Runs the crawler + every audit + the scorer
 * against a real site, with no LLM involved.
 *
 *   npx tsx scripts/test-audit.ts https://example-lawfirm.com
 */

import {
  auditAuthority,
  auditContent,
  auditConversion,
  auditNap,
  auditSchema,
  auditTechnical,
} from "../src/lib/agent/audits";
import { crawlFirmSite } from "../src/lib/agent/crawl";
import { computeScorecard, rankFailedSignals } from "../src/lib/agent/score";

const target = process.argv[2];
if (!target) {
  console.error("usage: npx tsx scripts/test-audit.ts <url>");
  process.exit(1);
}

const t0 = Date.now();
const crawl = await crawlFirmSite(target, 7);

console.log(`\n=== CRAWL (${Date.now() - t0}ms) ===`);
console.log(`final url : ${crawl.finalUrl}`);
console.log(`firm name : ${crawl.firmName}`);
console.log(`sitemap   : ${crawl.sitemapFound} (${crawl.sitemapUrlCount} urls)`);
console.log(`robots    : found=${crawl.robotsTxtFound} blocksAll=${crawl.robotsBlocksAll}`);
console.log(`pages     : ${crawl.pages.length}`);
for (const p of crawl.pages) {
  console.log(
    `  [${p.pageType.padEnd(14)}] ${p.wordCount.toString().padStart(5)}w ${p.ttfbMs
      .toString()
      .padStart(5)}ms  jsonld=${p.jsonLdTypes.join("/") || "-"}  ${p.url}`,
  );
}
if (crawl.errors.length) console.log(`errors    : ${crawl.errors.join(" | ")}`);

console.log(`\n=== DISCOVERED (${crawl.discovered.total} URLs classified, not fetched) ===`);
for (const [type, n] of Object.entries(crawl.discovered.byType)) {
  if (n > 0) console.log(`  ${type.padEnd(14)} ${String(n).padStart(4)}`);
}

const signals = [
  ...auditTechnical(crawl),
  ...auditContent(crawl),
  ...(await auditSchema(crawl)).signals,
  ...auditNap(crawl).signals,
  ...(await auditConversion(crawl)),
  ...auditAuthority(crawl),
];

const scorecard = computeScorecard(signals);

console.log(`\n=== SCORE ===`);
console.log(`${scorecard.overall}/100  grade ${scorecard.grade}`);
console.log(scorecard.headline);
for (const c of scorecard.categories) {
  console.log(`  ${c.category.padEnd(12)} ${String(c.score).padStart(3)}/100  (lost ${c.lostWeight}/${c.totalWeight})`);
}

console.log(`\n=== FAILING SIGNALS (${rankFailedSignals(signals).length}/${signals.length}) ===`);
for (const sig of rankFailedSignals(signals)) {
  console.log(`w${sig.weight} [${sig.key}] ${sig.detail}`);
}

console.log(`\ntotal ${Date.now() - t0}ms`);
