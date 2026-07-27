-- FirmScope — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- Security model: this app never talks to Supabase from the browser. All reads
-- and writes go through Next.js route handlers using the service-role key, so
-- RLS is enabled with NO public policies. That denies anon/authenticated access
-- entirely while the service role bypasses RLS. If you later add user accounts,
-- add owner-scoped policies here rather than loosening the anon role.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- teardowns: one row per audit the agent runs
-- ---------------------------------------------------------------------------
create table if not exists public.teardowns (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,

  firm_url         text not null,
  firm_name        text,
  city             text,
  practice_area    text,

  -- running | complete | failed
  status           text not null default 'running',
  error            text,

  overall_score    integer,
  grade            text,
  headline         text,
  category_scores  jsonb not null default '[]'::jsonb,

  findings         jsonb not null default '[]'::jsonb,
  signals          jsonb not null default '[]'::jsonb,

  outreach_subject text,
  outreach_body    text,
  outreach_hook    text,

  pages_analyzed   integer,
  duration_ms      integer,

  constraint teardowns_status_check
    check (status in ('running', 'complete', 'failed')),
  constraint teardowns_score_range
    check (overall_score is null or (overall_score >= 0 and overall_score <= 100))
);

create index if not exists teardowns_created_at_idx
  on public.teardowns (created_at desc);

create index if not exists teardowns_firm_url_idx
  on public.teardowns (firm_url);

-- ---------------------------------------------------------------------------
-- teardown_events: the agent's run timeline, so a saved teardown can be
-- replayed later instead of only being visible live in the browser.
-- ---------------------------------------------------------------------------
create table if not exists public.teardown_events (
  id           bigserial primary key,
  teardown_id  uuid not null references public.teardowns(id) on delete cascade,
  created_at   timestamptz not null default now(),
  seq          integer not null,

  -- plan | tool_start | tool_end | subagent | note | error | done
  kind         text not null,
  label        text not null,
  payload      jsonb
);

create index if not exists teardown_events_teardown_idx
  on public.teardown_events (teardown_id, seq);

-- ---------------------------------------------------------------------------
-- RLS: on, with no policies. Service role bypasses; everyone else is denied.
-- ---------------------------------------------------------------------------
alter table public.teardowns       enable row level security;
alter table public.teardown_events enable row level security;

-- Explicitly revoke from the browser-facing roles for clarity.
revoke all on public.teardowns       from anon, authenticated;
revoke all on public.teardown_events from anon, authenticated;
