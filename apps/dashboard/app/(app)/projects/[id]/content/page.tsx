import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase/server'
import type { ContentPiece, ContentStatus } from '@origami/shared/types'

interface ContentPageProps {
  params: { id: string }
}

export const metadata = { title: 'Content' }

const STATUS_STYLES: Record<ContentStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-yellow-900/40 text-yellow-400',
  approved: 'bg-green-900/40 text-green-400',
  rejected: 'bg-red-900/40 text-red-400',
  published: 'bg-blue-900/40 text-blue-400',
  failed: 'bg-destructive/20 text-destructive-foreground',
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
  failed: 'Failed',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getPlatformNames(platforms: ContentPiece['platforms_published']): string {
  return Object.keys(platforms).join(', ') || '—'
}

export default async function ContentPage({ params }: ContentPageProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    notFound()
  }

  const { data: pieces, error } = await supabase
    .from('content_pieces')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load content: ${error.message}`)
  }

  const typedPieces = (pieces ?? []) as ContentPiece[]

  if (typedPieces.length === 0) {
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
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <line x1="10" x2="8" y1="9" y2="9" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-foreground">No content yet</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          The pipeline will run at your scheduled time and generated content will appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {typedPieces.length} piece{typedPieces.length !== 1 ? 's' : ''} generated
        </p>
      </div>

      {/* Content table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Topic
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Platforms published
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {typedPieces.map((piece) => (
              <tr key={piece.id} className="bg-background transition-colors hover:bg-card">
                <td className="max-w-xs px-4 py-3">
                  <p className="truncate font-medium text-foreground">{piece.topic}</p>
                  {piece.angle && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {piece.angle}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[piece.status]
                    }`}
                  >
                    {STATUS_LABELS[piece.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {getPlatformNames(piece.platforms_published)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(piece.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
