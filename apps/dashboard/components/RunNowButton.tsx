'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface RunNowButtonProps {
  projectId: string
}

export function RunNowButton({ projectId }: RunNowButtonProps) {
  const router = useRouter()
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/trigger/${projectId}`, { method: 'POST' })
        const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
        if (!res.ok || data.error) {
          setMessage({ type: 'err', text: data.error ?? `Failed (${res.status})` })
          return
        }
        setMessage({ type: 'ok', text: 'Pipeline triggered. Content will appear shortly.' })
        // Refresh server data so new rows show up as they are created
        setTimeout(() => router.refresh(), 1500)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error'
        setMessage({ type: 'err', text: msg })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        {isPending ? 'Triggering…' : 'Run pipeline now'}
      </button>
      {message && (
        <p
          role="status"
          className={`text-xs ${
            message.type === 'ok' ? 'text-green-400' : 'text-destructive-foreground'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
