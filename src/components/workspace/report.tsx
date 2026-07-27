"use client";

import { motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Category, Finding, Severity, Teardown } from "@/lib/agent/types";

const CATEGORY_LABEL: Record<Category, string> = {
  technical: "Technical foundation",
  local: "Local & map pack",
  content: "Content architecture",
  authority: "Authority & E-E-A-T",
  conversion: "Intake & conversion",
};

const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; ring: string }> = {
  critical: { text: "text-critical", bg: "bg-critical/12", ring: "ring-critical/30" },
  high: { text: "text-high", bg: "bg-high/12", ring: "ring-high/30" },
  medium: { text: "text-medium", bg: "bg-medium/12", ring: "ring-medium/30" },
  low: { text: "text-low", bg: "bg-low/12", ring: "ring-low/30" },
};

const EFFORT_LABEL: Record<Finding["effort"], string> = {
  quick: "Quick fix",
  moderate: "Moderate",
  heavy: "Heavy lift",
};

/** Brass for healthy, amber mid, vermillion when it is genuinely bad. */
function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-brass)";
  if (score >= 45) return "var(--color-high)";
  return "var(--color-critical)";
}

function ScoreDial({ score, grade }: { score: number; grade: string }) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--color-ink-line)"
          strokeWidth="6"
        />
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="butt"
          strokeDasharray={`${dash} ${circumference}`}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="measure text-4xl font-medium tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="eyebrow mt-1">Grade {grade}</span>
      </div>
    </div>
  );
}

function CategoryBar({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs text-slate-soft">{label}</span>
        <span className="measure text-xs tabular-nums text-vellum">{score}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-ink-line">
        <motion.div
          className="h-full rounded-full"
          style={{ background: scoreColor(score) }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(`${label} copied`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy — your browser blocked clipboard access.");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-sm border border-ink-line-bright px-3 py-1.5 text-xs text-slate-soft transition-colors hover:border-brass/60 hover:text-brass"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : `Copy ${label.toLowerCase()}`}
    </button>
  );
}

export function Report({
  teardown,
  durationMs,
  persisted,
}: {
  teardown: Teardown;
  durationMs: number | null;
  persisted: boolean;
}) {
  const { scorecard, findings, outreachEmail } = teardown;

  const emailText = outreachEmail
    ? `Subject: ${outreachEmail.subject}\n\n${outreachEmail.body}`
    : "";

  return (
    <div className="space-y-10">
      {/* Case caption */}
      <header className="border-b border-ink-line pb-6">
        <p className="eyebrow mb-3">Teardown</p>
        <h2 className="font-display text-3xl leading-tight tracking-[-0.01em] text-vellum">
          {teardown.firmName ?? new URL(teardown.firmUrl).hostname}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <a
            href={teardown.firmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="measure inline-flex items-center gap-1.5 text-xs text-slate-soft transition-colors hover:text-brass"
          >
            {new URL(teardown.firmUrl).hostname}
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="measure text-xs text-slate-dim">
            {teardown.pagesAnalyzed} pages analyzed
          </span>
          <span className="measure text-xs text-slate-dim">
            {teardown.signals.length} checks
          </span>
          {durationMs !== null && (
            <span className="measure text-xs text-slate-dim">
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {teardown.city && (
            <span className="measure text-xs text-slate-dim">{teardown.city}</span>
          )}
          {!persisted && (
            <span className="measure text-xs text-high">not saved — Supabase off</span>
          )}
        </div>
      </header>

      {/* Score */}
      <section className="flex flex-col gap-8 sm:flex-row sm:items-center">
        <ScoreDial score={scorecard.overall} grade={scorecard.grade} />
        <div className="min-w-0 flex-1 space-y-4">
          <p className="text-[0.9375rem] leading-relaxed text-vellum">
            {scorecard.headline}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {scorecard.categories.map((c) => (
              <CategoryBar
                key={c.category}
                label={CATEGORY_LABEL[c.category]}
                score={c.score}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Exhibits — numbering is real ordering: worst first. */}
      <section>
        <div className="mb-6 flex items-baseline justify-between border-b border-ink-line pb-3">
          <p className="eyebrow">Findings — most damaging first</p>
          <span className="measure text-xs text-slate-dim">{findings.length}</span>
        </div>

        <ol className="docket docket-rule relative space-y-8">
          {findings.map((f, i) => {
            const style = SEVERITY_STYLE[f.severity];
            return (
              <motion.li
                key={f.id}
                className="docket-line"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.5 }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`measure rounded-sm px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.12em] ${style.bg} ${style.text}`}
                  >
                    {f.severity}
                  </span>
                  <span className="eyebrow">{CATEGORY_LABEL[f.category]}</span>
                  <span className="measure text-[0.625rem] uppercase tracking-[0.12em] text-slate-dim">
                    {EFFORT_LABEL[f.effort]}
                  </span>
                </div>

                <h3 className="font-display text-xl leading-snug text-vellum">
                  {f.title}
                </h3>

                <dl className="mt-3 space-y-2.5 text-sm leading-relaxed">
                  <div>
                    <dt className="eyebrow mb-1">Evidence</dt>
                    <dd className="measure text-[0.8125rem] text-slate-soft">
                      {f.evidence}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow mb-1">Why it costs cases</dt>
                    <dd className="text-slate-soft">{f.impact}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow mb-1">Fix</dt>
                    <dd className="text-slate-soft">{f.fix}</dd>
                  </div>
                </dl>
              </motion.li>
            );
          })}
        </ol>
      </section>

      {/* The email */}
      {outreachEmail && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-line pb-3">
            <p className="eyebrow">Outreach draft</p>
            <CopyButton text={emailText} label="Email" />
          </div>

          <div className="rounded-sm border border-ink-line bg-ink-raised p-6">
            <div className="mb-4 border-b border-ink-line pb-3">
              <span className="eyebrow mr-2">Subject</span>
              <span className="text-sm text-vellum">{outreachEmail.subject}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-vellum">
              {outreachEmail.body}
            </p>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-dim">
            Leads with: {outreachEmail.hook}
          </p>
        </section>
      )}
    </div>
  );
}
