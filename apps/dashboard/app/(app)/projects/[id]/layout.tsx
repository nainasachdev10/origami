import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase/server'
import type { Project } from '@origami/shared/types'

interface ProjectLayoutProps {
  children: React.ReactNode
  params: { id: string }
}

const TABS = [
  { label: 'Content', href: (id: string) => `/projects/${id}/content` },
  { label: 'Analytics', href: (id: string) => `/projects/${id}/analytics` },
  { label: 'Settings', href: (id: string) => `/projects/${id}/settings` },
]

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id) // RLS enforces this, but explicit for clarity
    .single()

  if (error || !data) {
    notFound()
  }

  const project = data as Project

  return (
    <div className="flex flex-col">
      {/* Project header */}
      <div className="border-b border-border bg-card px-8 py-5">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span aria-hidden="true">/</span>
          <span>{project.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              project.active
                ? 'bg-green-900/40 text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {project.active ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Tab nav */}
      <nav className="flex gap-1 border-b border-border px-8" aria-label="Project sections">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href(params.id)}
            className="relative -mb-px border-b-2 border-transparent px-1 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active]:border-primary data-[active]:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 p-8">{children}</div>
    </div>
  )
}
