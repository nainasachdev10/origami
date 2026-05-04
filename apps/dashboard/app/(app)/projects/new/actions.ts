'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/server'
import type { ContentStyle, ApprovalMode, PostingSchedule } from '@origami/shared/types'

export interface CreateProjectInput {
  name: string
  niche_keywords: string[]
  brand_voice_prompt: string
  content_style: ContentStyle
  platforms: string[]
  posting_schedule: PostingSchedule
  approval_mode: ApprovalMode
}

export async function createProject(data: CreateProjectInput) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated.' }
  }

  // Insert project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: data.name,
      niche_keywords: data.niche_keywords,
      brand_voice_prompt: data.brand_voice_prompt,
      content_style: data.content_style,
      approval_mode: data.approval_mode,
      posting_schedule: data.posting_schedule,
      active: true,
    })
    .select('id')
    .single()

  if (projectError || !project) {
    return { error: projectError?.message ?? 'Failed to create project.' }
  }

  // Insert platform rows for each selected platform (X is the only enabled one for Phase 1)
  if (data.platforms.length > 0) {
    const platformRows = data.platforms.map((platform) => ({
      project_id: project.id,
      platform: platform as 'x' | 'youtube' | 'instagram',
      enabled: true,
    }))

    const { error: platformError } = await supabase
      .from('project_platforms')
      .insert(platformRows)

    if (platformError) {
      // Non-fatal — project was created. Log and continue.
      console.error('Failed to insert platforms:', platformError.message)
    }
  }

  redirect(`/projects/${project.id}/content`)
}
