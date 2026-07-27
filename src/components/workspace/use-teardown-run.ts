"use client";

import { useCallback, useRef, useState } from "react";
import type { Teardown } from "@/lib/agent/types";
import { readStream, type EventKind, type Todo } from "@/lib/stream";

export interface DocketEntry {
  seq: number;
  kind: EventKind;
  label: string;
  payload?: unknown;
  /** Set when a matching tool_end arrives, so the row can show a duration. */
  settled?: boolean;
}

export type RunStatus = "idle" | "running" | "done" | "error";

export interface RunInput {
  url: string;
  city?: string;
  practiceArea?: string;
}

export function useTeardownRun() {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [entries, setEntries] = useState<DocketEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [teardown, setTeardown] = useState<Teardown | null>(null);
  const [summary, setSummary] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setEntries([]);
    setTodos([]);
    setTeardown(null);
    setSummary("");
    setDurationMs(null);
    setPersisted(false);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(
    async (input: RunInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      reset();
      setStatus("running");

      let finished = false;

      try {
        const res = await fetch("/api/teardown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // Non-streaming failures (bad URL, missing key) come back as JSON.
          const detail = await res.json().catch(() => null);
          throw new Error(
            detail?.error ?? `The run could not start (HTTP ${res.status}).`,
          );
        }

        for await (const msg of readStream(res.body)) {
          switch (msg.type) {
            case "event":
              setEntries((prev) => {
                // A tool_end settles the most recent unsettled tool_start
                // rather than adding a second row for the same work.
                if (msg.kind === "tool_end") {
                  const idx = [...prev]
                    .reverse()
                    .findIndex((e) => e.kind === "tool_start" && !e.settled);
                  if (idx !== -1) {
                    const realIdx = prev.length - 1 - idx;
                    const next = [...prev];
                    next[realIdx] = {
                      ...next[realIdx],
                      label: msg.label,
                      payload: msg.payload,
                      settled: true,
                    };
                    return next;
                  }
                }
                return [
                  ...prev,
                  {
                    seq: msg.seq,
                    kind: msg.kind,
                    label: msg.label,
                    payload: msg.payload,
                    settled: msg.kind !== "tool_start",
                  },
                ];
              });
              break;

            case "todos":
              setTodos(msg.todos);
              break;

            case "result":
              finished = true;
              setTeardown(msg.teardown);
              setSummary(msg.summary);
              setDurationMs(msg.durationMs);
              setPersisted(msg.persisted);
              setStatus("done");
              break;

            case "error":
              finished = true;
              setError(msg.message);
              setStatus("error");
              break;

            default:
              break;
          }
        }

        // Vercel can cut a long-running function mid-stream; without this the
        // UI would sit on "running" forever with no explanation.
        if (!finished) {
          setError(
            "The connection closed before the run finished. This usually means the run exceeded the serverless time limit — try again, or try a smaller site.",
          );
          setStatus("error");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [reset],
  );

  return {
    status,
    entries,
    todos,
    teardown,
    summary,
    durationMs,
    persisted,
    error,
    start,
    cancel,
    reset,
    setTeardown,
    setStatus,
  };
}
