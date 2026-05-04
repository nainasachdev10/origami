import Link from 'next/link'
import type { Project } from '@origami/shared/types'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { id, name, niche_keywords, active, content_style, posting_schedule, approval_mode } =
    project

  return (
    <Link
      href={`/projects/${id}/content`}
      className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/30"
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground group-hover:text-primary">
          {name}
        </h2>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            active
              ? 'bg-green-900/40 text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {active ? 'Active' : 'Paused'}
        </span>
      </div>

      {/* Keywords */}
      {niche_keywords.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {niche_keywords.slice(0, 4).map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {kw}
            </span>
          ))}
          {niche_keywords.length > 4 && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{niche_keywords.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="capitalize">{content_style}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">{posting_schedule.cron}</span>
        <span aria-hidden="true">·</span>
        <span className="capitalize">{approval_mode}</span>
      </div>
    </Link>
  )
}
