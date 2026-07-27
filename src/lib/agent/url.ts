/**
 * URL normalization, deliberately kept in its own dependency-free module.
 *
 * The teardown route needs to validate the submitted URL *before* it touches
 * the agent. Importing this from crawl.ts would drag in cheerio, and importing
 * it from the agent would drag in all of LangChain — both at module scope,
 * where a load failure becomes an uncatchable HTTP 500.
 */

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    throw new Error(`"${input}" is not a valid URL.`);
  }
}
