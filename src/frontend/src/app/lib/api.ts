import { Role } from './types'

/** Metadata label stamped on assistant messages. The real model lives backend-side. */
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

export interface ChatMessage {
  role: Role
  content: string
}

/**
 * Stream an assistant reply token-by-token from the backend proxy.
 *
 * Talks to the relative `/api/chat` path so the Vite dev-server proxy forwards it
 * to the FastAPI service (same-origin → no CORS, SSE flows through cleanly).
 * Yields each text delta as it arrives; throws on transport or model error.
 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE events are separated by a blank line; keep the trailing partial.
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const evt of events) {
      const dataLine = evt.split('\n').find(l => l.startsWith('data:'))
      if (!dataLine) continue
      const payload = JSON.parse(dataLine.slice(5).trim())
      if (payload.error) throw new Error(payload.error)
      if (payload.done) return
      if (payload.delta) yield payload.delta as string
    }
  }
}
