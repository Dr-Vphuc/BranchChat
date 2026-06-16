import { Conversation, ConversationMeta } from './types'

// Conversation history is persisted server-side (SQLite) and reached over the
// same-origin `/api` path — Vite proxies it to the backend in dev, and in prod
// the FastAPI service serves both the API and the static frontend. The server is
// the single source of truth: no localStorage mirror, so history needs the
// backend reachable to load/save.

/** Everything needed to restore one working conversation. Round-tripped to the
 *  server as a single JSON blob (the `data` column), so switching restores the
 *  tree, pan/zoom and selection together. */
export interface PersistedState {
  version: 1
  conversation: Conversation
  viewport: { offset: { x: number; y: number }; scale: number }
  activeNodeId: string | null
}

/** Initial payload to boot the app in one request. */
export interface BootstrapData {
  index: ConversationMeta[]
  lastActiveId: string | null
  active: PersistedState | null
}

/** Small JSON fetch helper. Throws on a non-2xx response. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<T>
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/** History index + last-active conversation (already loaded), in one round-trip. */
export function bootstrapFromServer(): Promise<BootstrapData> {
  return api<BootstrapData>('/bootstrap')
}

// ── Conversation index + state ─────────────────────────────────────────────────

/** The history index (metadata only), most-recent first. */
export function loadIndex(): Promise<ConversationMeta[]> {
  return api<ConversationMeta[]>('/conversations')
}

/** Full state for one conversation; `null` if it no longer exists (404). */
export async function loadConversation(id: string): Promise<PersistedState | null> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<PersistedState>
}

/** Upsert one conversation; resolves to the refreshed index (most-recent first). */
export function saveConversation(state: PersistedState): Promise<ConversationMeta[]> {
  return api<ConversationMeta[]>(`/conversations/${encodeURIComponent(state.conversation.id)}`, {
    method: 'PUT',
    body: JSON.stringify(state),
  })
}

/** Delete one conversation; resolves to the refreshed index. */
export function deleteConversation(id: string): Promise<ConversationMeta[]> {
  return api<ConversationMeta[]>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ── Last-active pointer (which conversation to reopen on load) ───────────────────

export async function saveLastActiveId(id: string): Promise<void> {
  await api('/last-active', { method: 'PUT', body: JSON.stringify({ id }) })
}
