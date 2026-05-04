export const metadata = { title: 'Analytics' }

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
          aria-hidden="true"
        >
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-foreground">Analytics coming in Phase 3</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Once content is published, the analytics collector will pull engagement metrics
        from each platform and display them here.
      </p>
    </div>
  )
}
