/**
 * packages/shared/src/types.ts
 *
 * Hand-written TypeScript types matching the Supabase schema in
 * infra/supabase/migrations/001_initial_schema.sql.
 *
 * When a live Supabase project is connected, replace this file with the
 * output of `supabase gen types typescript --project-id <id> --schema public`.
 *
 * Hard rule from spec section 9: NO `any`. All types must be explicit.
 */

// =============================================================================
// Enums / Literal Unions
// =============================================================================

/** Lifecycle statuses for a content piece. */
export type ContentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "published"
  | "failed";

/** Supported publishing platforms. */
export type Platform = "youtube" | "instagram" | "x";

/** Approval mode for a project. */
export type ApprovalMode = "manual" | "auto";

/** Content style options. */
export type ContentStyle = "long-form" | "short-form" | "thread" | "carousel";

/** Video style options (optional on a project). */
export type VideoStyle = "text-overlay" | "stock-footage" | "avatar";

/** Trend data sources. */
export type TrendSource = "google_trends" | "reddit" | "x" | "youtube";

// =============================================================================
// Composite types
// =============================================================================

/**
 * Shape stored in projects.posting_schedule (jsonb).
 * cron: standard 5-field cron expression, e.g. "0 10 * * *"
 * timezone: IANA timezone string, e.g. "Asia/Kolkata"
 */
export interface PostingSchedule {
  cron: string;
  timezone: string;
}

/**
 * Shape stored in content_pieces.platforms_published (jsonb).
 * Maps platform name → platform-specific content ID returned after publish.
 */
export type PlatformsPublished = Partial<Record<Platform, string>>;

// =============================================================================
// Database interface — mirrors Supabase codegen output structure
// Each table exposes Row (SELECT), Insert, and Update shapes.
// =============================================================================

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          niche_keywords: string[];
          brand_voice_prompt: string;
          content_style: ContentStyle;
          video_style: VideoStyle | null;
          approval_mode: ApprovalMode;
          posting_schedule: PostingSchedule;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          niche_keywords: string[];
          brand_voice_prompt: string;
          content_style: ContentStyle;
          video_style?: VideoStyle | null;
          approval_mode?: ApprovalMode;
          posting_schedule: PostingSchedule;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          niche_keywords?: string[];
          brand_voice_prompt?: string;
          content_style?: ContentStyle;
          video_style?: VideoStyle | null;
          approval_mode?: ApprovalMode;
          posting_schedule?: PostingSchedule;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      project_platforms: {
        Row: {
          id: string;
          project_id: string;
          platform: Platform;
          account_handle: string | null;
          credentials_encrypted: Record<string, unknown> | null;
          enabled: boolean;
        };
        Insert: {
          id?: string;
          project_id: string;
          platform: Platform;
          account_handle?: string | null;
          credentials_encrypted?: Record<string, unknown> | null;
          enabled?: boolean;
        };
        Update: {
          id?: string;
          project_id?: string;
          platform?: Platform;
          account_handle?: string | null;
          credentials_encrypted?: Record<string, unknown> | null;
          enabled?: boolean;
        };
        Relationships: [];
      };

      content_pieces: {
        Row: {
          id: string;
          project_id: string;
          topic: string;
          angle: string | null;
          script: string | null;
          caption: string | null;
          hashtags: string[] | null;
          thumbnail_url: string | null;
          video_url: string | null;
          status: ContentStatus;
          platforms_published: PlatformsPublished;
          created_at: string;
          scheduled_for: string | null;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          topic: string;
          angle?: string | null;
          script?: string | null;
          caption?: string | null;
          hashtags?: string[] | null;
          thumbnail_url?: string | null;
          video_url?: string | null;
          status?: ContentStatus;
          platforms_published?: PlatformsPublished;
          created_at?: string;
          scheduled_for?: string | null;
          published_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          topic?: string;
          angle?: string | null;
          script?: string | null;
          caption?: string | null;
          hashtags?: string[] | null;
          thumbnail_url?: string | null;
          video_url?: string | null;
          status?: ContentStatus;
          platforms_published?: PlatformsPublished;
          created_at?: string;
          scheduled_for?: string | null;
          published_at?: string | null;
        };
        Relationships: [];
      };

      content_analytics: {
        Row: {
          id: string;
          content_piece_id: string;
          platform: Platform;
          views: number;
          likes: number;
          comments: number;
          shares: number;
          /** Click-through rate as a percentage (YouTube-specific). Null for other platforms. */
          ctr: number | null;
          /** Unique accounts reached (Instagram-specific). Null for other platforms. */
          reach: number | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          content_piece_id: string;
          platform: Platform;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          ctr?: number | null;
          reach?: number | null;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          content_piece_id?: string;
          platform?: Platform;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          ctr?: number | null;
          reach?: number | null;
          fetched_at?: string;
        };
        Relationships: [];
      };

      trend_cache: {
        Row: {
          id: string;
          source: TrendSource;
          niche_keywords: string[];
          /** Raw merged payload from the trend-research service. Shape varies by source. */
          payload: Record<string, unknown>;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          source: TrendSource;
          niche_keywords: string[];
          payload: Record<string, unknown>;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          source?: TrendSource;
          niche_keywords?: string[];
          payload?: Record<string, unknown>;
          fetched_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// =============================================================================
// Convenience type aliases (use these throughout the app)
// =============================================================================

/** A project row as returned by SELECT. */
export type Project = Database["public"]["Tables"]["projects"]["Row"];

/** Insert shape for creating a new project. */
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];

/** Update shape for modifying an existing project. */
export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

/** A project_platforms row as returned by SELECT. */
export type ProjectPlatform =
  Database["public"]["Tables"]["project_platforms"]["Row"];

/** Insert shape for adding a platform to a project. */
export type ProjectPlatformInsert =
  Database["public"]["Tables"]["project_platforms"]["Insert"];

/** Update shape for modifying a platform config. */
export type ProjectPlatformUpdate =
  Database["public"]["Tables"]["project_platforms"]["Update"];

/** A content_pieces row as returned by SELECT. */
export type ContentPiece =
  Database["public"]["Tables"]["content_pieces"]["Row"];

/** Insert shape for creating a new content piece. */
export type ContentPieceInsert =
  Database["public"]["Tables"]["content_pieces"]["Insert"];

/** Update shape for modifying a content piece. */
export type ContentPieceUpdate =
  Database["public"]["Tables"]["content_pieces"]["Update"];

/** A content_analytics row as returned by SELECT. */
export type ContentAnalytics =
  Database["public"]["Tables"]["content_analytics"]["Row"];

/** Insert shape for storing analytics data. */
export type ContentAnalyticsInsert =
  Database["public"]["Tables"]["content_analytics"]["Insert"];

/** Update shape for updating analytics. */
export type ContentAnalyticsUpdate =
  Database["public"]["Tables"]["content_analytics"]["Update"];

/** A trend_cache row as returned by SELECT. */
export type TrendCache = Database["public"]["Tables"]["trend_cache"]["Row"];

/** Insert shape for storing trend data. */
export type TrendCacheInsert =
  Database["public"]["Tables"]["trend_cache"]["Insert"];
