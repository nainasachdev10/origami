-- =============================================================================
-- Migration 003: Performance Indexes
-- Origami — Autonomous Content Creation Agent
-- =============================================================================

-- ---------------------------------------------------------------------------
-- projects indexes
-- ---------------------------------------------------------------------------

-- The most common query pattern: "fetch all projects for this user"
create index idx_projects_user_id
  on projects (user_id);

-- Filter to only active projects (used by n8n cron to find jobs to run)
create index idx_projects_active
  on projects (active)
  where active = true;

-- ---------------------------------------------------------------------------
-- content_pieces indexes
-- ---------------------------------------------------------------------------

-- List content for a project filtered by status (dashboard queries)
create index idx_content_pieces_project_id_status
  on content_pieces (project_id, status);

-- List content for a project ordered by creation date (timeline view)
create index idx_content_pieces_project_id_created_at
  on content_pieces (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- content_analytics indexes
-- ---------------------------------------------------------------------------

-- Fetch analytics for a specific content piece (used in analytics view
-- and in the learning loop feed to topic selector)
create index idx_content_analytics_content_piece_id
  on content_analytics (content_piece_id);

-- ---------------------------------------------------------------------------
-- trend_cache indexes
-- ---------------------------------------------------------------------------

-- Look up latest cache entry for a given source, ordered by freshness
-- (used by trend-research service to check 6-hour TTL)
create index idx_trend_cache_source_fetched_at
  on trend_cache (source, fetched_at desc);
