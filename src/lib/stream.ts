/** Shape of the SSE messages sent by /api/teardown. Shared by route and UI. */

import type { Teardown } from "@/lib/agent/types";

export type EventKind =
  | "plan"
  | "tool_start"
  | "tool_end"
  | "subagent"
  | "note"
  | "error"
  | "done";

export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export type StreamMessage =
  | {
      type: "start";
      teardownId: string | null;
      firmUrl: string;
      city: string | null;
      practiceArea: string | null;
    }
  | { type: "event"; seq: number; kind: EventKind; label: string; payload?: unknown }
  | { type: "todos"; todos: Todo[] }
  | {
      type: "result";
      teardown: Teardown;
      summary: string;
      durationMs: number;
      persisted: boolean;
    }
  | { type: "error"; message: string }
  | { type: "end" };

/**
 * Parse a raw SSE byte stream into typed messages.
 *
 * Buffers across chunk boundaries — a JSON payload can and does get split
 * mid-object, and parsing per-chunk drops those events silently.
 */
export async function* readStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          yield JSON.parse(line.slice(6)) as StreamMessage;
        } catch {
          // A malformed frame should not kill the run.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
