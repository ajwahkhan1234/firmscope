/**
 * Server-only Supabase access.
 *
 * The browser never holds a Supabase key. Every read/write goes through a
 * route handler using the service role, which keeps RLS closed to the public
 * roles (see supabase/schema.sql).
 *
 * Supabase is treated as optional at runtime: if it is not configured the app
 * still runs the agent and renders the teardown, it just does not persist.
 * That means a missing env var degrades history rather than breaking the demo.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Scorecard, Finding, Signal } from "@/lib/agent/types";
import type { TeardownRow } from "./types";

export type { TeardownRow };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceKey);
}

export function supabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  cached = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export async function createTeardownRow(input: {
  firmUrl: string;
  city?: string | null;
  practiceArea?: string | null;
}): Promise<string | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("teardowns")
    .insert({
      firm_url: input.firmUrl,
      city: input.city ?? null,
      practice_area: input.practiceArea ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[supabase] createTeardownRow failed:", error.message);
    return null;
  }
  return data.id as string;
}

export async function completeTeardownRow(
  id: string,
  payload: {
    firmName: string | null;
    scorecard: Scorecard;
    findings: Finding[];
    signals: Signal[];
    outreach: { subject: string; body: string; hook: string } | null;
    pagesAnalyzed: number;
    durationMs: number;
  },
): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;

  const { error } = await db
    .from("teardowns")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      firm_name: payload.firmName,
      overall_score: payload.scorecard.overall,
      grade: payload.scorecard.grade,
      headline: payload.scorecard.headline,
      category_scores: payload.scorecard.categories,
      findings: payload.findings,
      signals: payload.signals,
      outreach_subject: payload.outreach?.subject ?? null,
      outreach_body: payload.outreach?.body ?? null,
      outreach_hook: payload.outreach?.hook ?? null,
      pages_analyzed: payload.pagesAnalyzed,
      duration_ms: payload.durationMs,
    })
    .eq("id", id);

  if (error) console.error("[supabase] completeTeardownRow failed:", error.message);
}

export async function failTeardownRow(id: string, message: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from("teardowns")
    .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
    .eq("id", id);
}

export async function recordEvent(
  teardownId: string,
  seq: number,
  kind: string,
  label: string,
  payload?: unknown,
): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  const { error } = await db.from("teardown_events").insert({
    teardown_id: teardownId,
    seq,
    kind,
    label,
    payload: payload ?? null,
  });
  if (error) console.error("[supabase] recordEvent failed:", error.message);
}

export async function listTeardowns(limit = 25): Promise<TeardownRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("teardowns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[supabase] listTeardowns failed:", error.message);
    return [];
  }
  return (data ?? []) as TeardownRow[];
}

export async function getTeardown(id: string): Promise<TeardownRow | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("teardowns").select("*").eq("id", id).single();
  if (error) return null;
  return data as TeardownRow;
}
