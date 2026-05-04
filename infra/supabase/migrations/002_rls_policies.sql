-- =============================================================================
-- Migration 002: Row-Level Security Policies
-- Origami — Autonomous Content Creation Agent
--
-- Hard rule from spec section 9: "RLS everywhere. Every Supabase table
-- accessed from the client must have row-level security enabled."
-- =============================================================================

-- ---------------------------------------------------------------------------
-- projects
-- Users can only see and modify their own projects.
-- ---------------------------------------------------------------------------
alter table projects enable row level security;

create policy "users see own projects"
  on projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- project_platforms
-- Access granted only when the parent project belongs to the requesting user.
-- ---------------------------------------------------------------------------
alter table project_platforms enable row level security;

create policy "users see own project platforms"
  on project_platforms
  for all
  using (
    exists (
      select 1
      from projects p
      where p.id = project_platforms.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from projects p
      where p.id = project_platforms.project_id
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- content_pieces
-- Access granted when the parent project belongs to the requesting user.
-- ---------------------------------------------------------------------------
alter table content_pieces enable row level security;

create policy "users see own content pieces"
  on content_pieces
  for all
  using (
    exists (
      select 1
      from projects p
      where p.id = content_pieces.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from projects p
      where p.id = content_pieces.project_id
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- content_analytics
-- Access granted via content_piece → project → user chain.
-- ---------------------------------------------------------------------------
alter table content_analytics enable row level security;

create policy "users see own content analytics"
  on content_analytics
  for all
  using (
    exists (
      select 1
      from content_pieces cp
      join projects p on p.id = cp.project_id
      where cp.id = content_analytics.content_piece_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from content_pieces cp
      join projects p on p.id = cp.project_id
      where cp.id = content_analytics.content_piece_id
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- trend_cache
-- No direct client access — this table is read/written only by the n8n
-- service role or the trend-research Python service using the service role
-- key. Client browsers never touch trend_cache directly.
--
-- We enable RLS and grant access ONLY to the service_role, which bypasses
-- RLS by default in Supabase. The policy below makes it explicit that no
-- authenticated or anon user can read/write this table via the client SDK.
-- ---------------------------------------------------------------------------
alter table trend_cache enable row level security;

-- No policy created = no authenticated/anon user can access.
-- service_role bypasses RLS automatically (Supabase default behaviour).
-- This is intentional: trend_cache is an internal orchestration table.

comment on table trend_cache is
  'Internal cache table. No RLS policy = client access blocked. Service role only.';
