import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify the project belongs to this user (RLS would also block, but be explicit)
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, active')
    .eq('id', params.projectId)
    .eq('user_id', user.id)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (!project.active) {
    return NextResponse.json(
      { error: 'Project is inactive — toggle it on in Settings first.' },
      { status: 400 },
    )
  }

  const webhookBase = process.env.N8N_WEBHOOK_BASE_URL
  if (!webhookBase) {
    return NextResponse.json(
      { error: 'N8N_WEBHOOK_BASE_URL not configured.' },
      { status: 500 },
    )
  }

  const webhookUrl = `${webhookBase.replace(/\/$/, '')}/webhook/trigger-pipeline`

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.N8N_API_KEY) {
      headers['X-N8N-API-KEY'] = process.env.N8N_API_KEY
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id: project.id }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `n8n returned ${res.status}: ${text || res.statusText}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, project: project.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to reach n8n: ${message}` },
      { status: 502 },
    )
  }
}
