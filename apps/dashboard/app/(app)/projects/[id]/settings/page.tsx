import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase/server'
import type { Project } from '@origami/shared/types'

interface SettingsPageProps {
  params: { id: string }
}

export const metadata = { title: 'Project Settings' }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:gap-8">
      <dt className="w-40 shrink-0 text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}

export default async function SettingsPage({ params }: SettingsPageProps) {
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
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    notFound()
  }

  const project = data as Project

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Project settings</h2>
        {/* Edit is a stub for Phase 2 */}
        <button
          type="button"
          disabled
          title="Editing will be available in a future update."
          className="cursor-not-allowed rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground opacity-50"
        >
          Edit
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <dl className="divide-y divide-border px-5">
          <Row label="Name" value={project.name} />
          <Row
            label="Niche keywords"
            value={project.niche_keywords.length > 0 ? project.niche_keywords.join(', ') : '—'}
          />
          <Row label="Content style" value={project.content_style} />
          <Row label="Approval mode" value={project.approval_mode} />
          <Row label="Cron" value={project.posting_schedule.cron} />
          <Row label="Timezone" value={project.posting_schedule.timezone} />
          <Row label="Status" value={project.active ? 'Active' : 'Paused'} />
          <Row
            label="Brand voice"
            value={
              project.brand_voice_prompt.length > 120
                ? `${project.brand_voice_prompt.slice(0, 120)}…`
                : project.brand_voice_prompt
            }
          />
          <Row
            label="Created"
            value={new Date(project.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          />
        </dl>
      </div>
    </div>
  )
}
