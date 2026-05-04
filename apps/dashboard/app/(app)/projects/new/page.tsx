'use client'

import { useState, useTransition } from 'react'
import { createProject } from './actions'
import type { ContentStyle, ApprovalMode } from '@origami/shared/types'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const CONTENT_STYLE_OPTIONS: { value: ContentStyle; label: string }[] = [
  { value: 'thread', label: 'Thread' },
  { value: 'short-form', label: 'Short-form' },
  { value: 'long-form', label: 'Long-form' },
  { value: 'carousel', label: 'Carousel' },
]

export default function NewProjectPage() {
  // Form state
  const [name, setName] = useState('')
  const [nicheKeywords, setNicheKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [brandVoicePrompt, setBrandVoicePrompt] = useState('')
  const [contentStyle, setContentStyle] = useState<ContentStyle>('thread')
  const [cron, setCron] = useState('0 10 * * *')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('manual')
  const [xEnabled, setXEnabled] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Tag input: press Enter or comma to add keyword
  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword()
    }
  }

  function addKeyword() {
    const trimmed = keywordInput.trim().replace(/,$/, '')
    if (trimmed && !nicheKeywords.includes(trimmed)) {
      setNicheKeywords((prev) => [...prev, trimmed])
    }
    setKeywordInput('')
  }

  function removeKeyword(kw: string) {
    setNicheKeywords((prev) => prev.filter((k) => k !== kw))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Project name is required.')
      return
    }
    if (!brandVoicePrompt.trim()) {
      setError('Brand voice prompt is required.')
      return
    }

    const platforms: string[] = []
    if (xEnabled) platforms.push('x')

    startTransition(async () => {
      const result = await createProject({
        name: name.trim(),
        niche_keywords: nicheKeywords,
        brand_voice_prompt: brandVoicePrompt.trim(),
        content_style: contentStyle,
        platforms,
        posting_schedule: { cron, timezone },
        approval_mode: approvalMode,
      })

      if (result?.error) {
        setError(result.error)
      }
      // On success, createProject redirects server-side
    })
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">New Project</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define a niche and the agent will handle the rest.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Project name */}
          <Field label="Project name" htmlFor="name" required>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Tech Reviews"
              className={inputClass}
            />
          </Field>

          {/* Niche keywords */}
          <Field
            label="Niche keywords"
            htmlFor="keyword-input"
            hint="Type a keyword and press Enter to add it."
          >
            <div className="rounded-lg border border-border bg-card p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
              <div className="flex flex-wrap gap-1.5">
                {nicheKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/20 px-2 py-0.5 text-sm text-primary"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="text-primary/60 hover:text-primary"
                      aria-label={`Remove keyword ${kw}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  id="keyword-input"
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  onBlur={addKeyword}
                  placeholder={nicheKeywords.length === 0 ? 'AI, LLMs, tech news…' : ''}
                  className="min-w-32 flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
                />
              </div>
            </div>
          </Field>

          {/* Brand voice */}
          <Field
            label="Brand voice prompt"
            htmlFor="brand-voice"
            required
            hint="Describe the tone and style the agent should write in."
          >
            <textarea
              id="brand-voice"
              required
              rows={3}
              value={brandVoicePrompt}
              onChange={(e) => setBrandVoicePrompt(e.target.value)}
              placeholder="e.g. Witty, tech-savvy, uses analogies, never clickbait. Talks like a smart friend, not a press release."
              className={`${inputClass} resize-none`}
            />
          </Field>

          {/* Content style */}
          <Field label="Content style" htmlFor="content-style">
            <select
              id="content-style"
              value={contentStyle}
              onChange={(e) => setContentStyle(e.target.value as ContentStyle)}
              className={inputClass}
            >
              {CONTENT_STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Platforms */}
          <Field label="Platforms">
            <div className="space-y-3">
              {/* X — enabled */}
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={xEnabled}
                  onChange={(e) => setXEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-medium text-foreground">X (Twitter)</span>
              </label>

              {/* Coming soon platforms */}
              {(['YouTube', 'Instagram'] as const).map((platform) => (
                <label
                  key={platform}
                  className="flex cursor-not-allowed items-center gap-3 opacity-40"
                >
                  <input
                    type="checkbox"
                    disabled
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm font-medium text-foreground">{platform}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Coming soon
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {/* Posting schedule */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cron schedule" htmlFor="cron" hint="5-field cron expression (UTC offset by TZ below).">
              <input
                id="cron"
                type="text"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 10 * * *"
                className={`${inputClass} font-mono`}
              />
            </Field>

            <Field label="Timezone" htmlFor="timezone">
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Approval mode */}
          <Field
            label="Approval mode"
            hint="Manual: you approve each post on Telegram before it goes live."
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={approvalMode === 'auto'}
                onClick={() =>
                  setApprovalMode((prev) => (prev === 'manual' ? 'auto' : 'manual'))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                  approvalMode === 'auto' ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    approvalMode === 'auto' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-foreground">
                {approvalMode === 'auto' ? 'Auto-publish' : 'Manual approval'}
              </span>
            </div>
          </Field>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
            <a
              href="/projects"
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Helpers
const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-ring'

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive-foreground">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}
