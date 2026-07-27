/**
 * Deterministic scoring.
 *
 * The model is not allowed to invent the score. It calls this function with
 * the signals its tools produced and gets a reproducible number back. Two runs
 * over an unchanged site yield the same score, which is what makes the number
 * usable in a sales conversation.
 */

import { CATEGORIES, type Category, type CategoryScore, type Scorecard, type Signal } from "./types";

/**
 * Category weights for the overall score, tuned for law-firm sites.
 * Local and conversion are weighted heavily because that is where legal
 * marketing actually wins or loses — not on generic technical hygiene.
 */
const CATEGORY_WEIGHT: Record<Category, number> = {
  technical: 0.18,
  local: 0.26,
  content: 0.24,
  authority: 0.18,
  conversion: 0.14,
};

const CATEGORY_LABEL: Record<Category, string> = {
  technical: "Technical foundation",
  local: "Local & map pack",
  content: "Content architecture",
  authority: "Authority & E-E-A-T",
  conversion: "Intake & conversion",
};

export function categoryLabel(c: Category): string {
  return CATEGORY_LABEL[c];
}

function gradeFor(score: number): Scorecard["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function computeScorecard(signals: Signal[]): Scorecard {
  const categories: CategoryScore[] = CATEGORIES.map((category) => {
    const inCat = signals.filter((sig) => sig.category === category);
    const totalWeight = inCat.reduce((a, sig) => a + sig.weight, 0);
    const lostWeight = inCat
      .filter((sig) => !sig.passed)
      .reduce((a, sig) => a + sig.weight, 0);

    // A category with no signals scores 100 rather than 0 — absence of
    // measurement is not evidence of failure.
    const score =
      totalWeight === 0
        ? 100
        : Math.round(((totalWeight - lostWeight) / totalWeight) * 100);

    return { category, score, lostWeight, totalWeight };
  });

  const overall = Math.round(
    categories.reduce((acc, c) => acc + c.score * CATEGORY_WEIGHT[c.category], 0),
  );

  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  const failedCritical = signals.filter((sig) => !sig.passed && sig.weight >= 8);

  let headline: string;
  if (overall >= 85) {
    headline = `Strong across the board. The clearest remaining gap is ${CATEGORY_LABEL[
      weakest.category
    ].toLowerCase()} at ${weakest.score}/100.`;
  } else if (overall >= 70) {
    headline = `Solid foundation with real upside. ${CATEGORY_LABEL[weakest.category]} is the drag at ${weakest.score}/100${
      failedCritical.length ? `, and ${failedCritical.length} high-impact issue(s) remain open.` : "."
    }`;
  } else if (overall >= 55) {
    headline = `Competitive in parts, but ${CATEGORY_LABEL[
      weakest.category
    ].toLowerCase()} (${weakest.score}/100) is holding the whole site back.`;
  } else if (overall >= 40) {
    headline = `Underperforming. ${failedCritical.length} high-impact issue(s) are actively suppressing visibility, worst in ${CATEGORY_LABEL[
      weakest.category
    ].toLowerCase()}.`;
  } else {
    headline = `Critical. The site is failing ${failedCritical.length} high-impact checks and is unlikely to compete for any commercial legal keyword in its market as it stands.`;
  }

  return { overall, grade: gradeFor(overall), categories, headline };
}

/** Signals that should become findings, worst first. */
export function rankFailedSignals(signals: Signal[]): Signal[] {
  return signals
    .filter((sig) => !sig.passed)
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.key.localeCompare(b.key);
    });
}
