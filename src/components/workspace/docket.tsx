"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Todo } from "@/lib/stream";
import type { DocketEntry, RunStatus } from "./use-teardown-run";

/**
 * The run record. Numbering here is real ordering information — this is the
 * sequence the agent actually worked in — which is why it gets the ruled
 * margin rather than a plain list.
 */
export function Docket({
  entries,
  todos,
  status,
}: {
  entries: DocketEntry[];
  todos: Todo[];
  status: RunStatus;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "running") {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [entries.length, status]);

  return (
    <div className="space-y-8">
      {todos.length > 0 && (
        <section>
          <p className="eyebrow mb-3">The agent&apos;s plan</p>
          <ul className="space-y-1.5">
            {todos.map((todo, i) => (
              <li key={`${i}-${todo.content}`} className="flex items-start gap-2.5">
                <span className="mt-[3px] shrink-0">
                  {todo.status === "completed" ? (
                    <Check className="h-3.5 w-3.5 text-brass" strokeWidth={2.5} />
                  ) : todo.status === "in_progress" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-arc" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-slate-dim" strokeWidth={1.5} />
                  )}
                </span>
                <span
                  className={`text-sm leading-snug ${
                    todo.status === "completed"
                      ? "text-slate-dim line-through decoration-slate-dim/40"
                      : todo.status === "in_progress"
                        ? "text-vellum"
                        : "text-slate-soft"
                  }`}
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="eyebrow mb-4">Run record</p>

        {entries.length === 0 && status === "running" && (
          <p className="flex items-center gap-2 text-sm text-slate-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-arc" />
            Starting the agent…
          </p>
        )}

        <ol className="docket docket-rule relative space-y-3">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.seq}
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="docket-line"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-[3px] shrink-0">
                    {entry.kind === "error" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-critical" />
                    ) : entry.settled ? (
                      <Check className="h-3.5 w-3.5 text-brass" strokeWidth={2.5} />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-arc" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm leading-snug ${
                        entry.kind === "error" ? "text-critical" : "text-vellum"
                      }`}
                    >
                      {entry.label}
                    </p>
                    <EntryDetail payload={entry.payload} />
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        <div ref={endRef} />
      </section>
    </div>
  );
}

/** Render the useful bits of a tool payload without dumping raw JSON. */
function EntryDetail({ payload }: { payload?: unknown }) {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  const bits: string[] = [];

  if (typeof p.pages === "number") bits.push(`${p.pages} pages`);
  if (typeof p.firmName === "string") bits.push(p.firmName);
  if (typeof p.sitemapFound === "boolean")
    bits.push(p.sitemapFound ? "sitemap found" : "no sitemap");
  if (typeof p.checks === "number") bits.push(`${p.checks} checks`);
  if (typeof p.failed === "number") bits.push(`${p.failed} failing`);
  if (typeof p.practicePages === "number")
    bits.push(`${p.practicePages} practice pages`);
  if (typeof p.bios === "number") bits.push(`${p.bios} bios`);
  if (typeof p.distinctPhones === "number")
    bits.push(`${p.distinctPhones} phone numbers`);
  if (Array.isArray(p.typesFound) && p.typesFound.length)
    bits.push(`schema: ${p.typesFound.slice(0, 4).join(", ")}`);
  if (Array.isArray(p.topics)) bits.push(p.topics.join(", "));
  if (typeof p.overall === "number") bits.push(`${p.overall}/100`);
  if (typeof p.findings === "number") bits.push(`${p.findings} findings`);
  if (typeof p.url === "string") {
    try {
      bits.push(new URL(p.url).pathname);
    } catch {
      /* ignore */
    }
  }

  if (bits.length === 0) return null;

  return (
    <p className="measure mt-0.5 truncate text-[0.6875rem] text-slate-dim">
      {bits.join(" · ")}
    </p>
  );
}
