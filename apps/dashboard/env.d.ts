/**
 * Explicit process.env type declarations for the dashboard app.
 *
 * Required because tsconfig (via packages/config/tsconfig.base.json) sets
 * `noPropertyAccessFromIndexSignature: true`, which forces bracket notation on
 * index-signature properties.  Declaring each variable as an explicit named
 * property on ProcessEnv lets callers use dot notation (process.env.FOO).
 */

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SUPABASE_URL: string | undefined;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
    readonly SUPABASE_SERVICE_ROLE_KEY: string | undefined;
    readonly NEXT_PUBLIC_SITE_URL: string | undefined;
    readonly TELEGRAM_BOT_TOKEN: string | undefined;
    readonly N8N_WEBHOOK_BASE_URL: string | undefined;
    readonly N8N_API_KEY: string | undefined;
  }
}
