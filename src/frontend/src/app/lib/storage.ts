import { Conversation, ConversationMeta } from './types'

// Key namespace. Each conversation lives in its own `conv:<id>` key; a light
// `index` key holds just the metadata used to list/search history; `lastActiveId`
// remembers which conversation to reopen on load. `branchchat:v1` is the old
// single-conversation key, migrated once into the new layout.
const LEGACY_KEY = 'branchchat:v1'
const INDEX_KEY = 'branchchat:index:v1'
const CONV_PREFIX = 'branchchat:conv:'
const LAST_ACTIVE_KEY = 'branchchat:lastActiveId'

/** Everything needed to restore one working conversation from localStorage. */
export interface PersistedState {
  version: 1
  conversation: Conversation
  viewport: { offset: { x: number; y: number }; scale: number }
  activeNodeId: string | null
}

function isValid(parsed: unknown): parsed is PersistedState {
  if (typeof parsed !== 'object' || parsed === null) return false
  const p = parsed as Record<string, unknown>
  const conv = p.conversation as Record<string, unknown> | undefined
  const vp = p.viewport as Record<string, unknown> | undefined
  return (
    p.version === 1 &&
    !!conv &&
    Array.isArray(conv.nodes) &&
    !!vp &&
    typeof vp.offset === 'object' &&
    vp.offset !== null &&
    typeof vp.scale === 'number'
  )
}

// ── Low-level localStorage helpers (all swallow errors / SSR-safe) ────────────

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (e.g. storage full or disabled)
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

const convKey = (id: string) => `${CONV_PREFIX}${id}`

// ── Index of conversations (metadata only) ────────────────────────────────────

function isMeta(x: unknown): x is ConversationMeta {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.title === 'string' &&
    typeof m.createdAt === 'number' &&
    typeof m.updatedAt === 'number' &&
    typeof m.nodeCount === 'number'
  )
}

/** Read the conversation index (most-recent first). Returns [] on absence/corruption. */
export function loadIndex(): ConversationMeta[] {
  const parsed = read<unknown>(INDEX_KEY)
  if (!Array.isArray(parsed)) return []
  return (parsed as unknown[]).filter(isMeta).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveIndex(index: ConversationMeta[]): void {
  write(INDEX_KEY, index)
}

// ── Per-conversation state ────────────────────────────────────────────────────

/** Read one conversation's full state. Null on absence/parse/shape mismatch. */
export function loadConversation(id: string): PersistedState | null {
  const parsed = read<unknown>(convKey(id))
  return isValid(parsed) ? parsed : null
}

function metaFromState(state: PersistedState): ConversationMeta {
  const c = state.conversation
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    nodeCount: c.nodes.length,
  }
}

/**
 * Persist one conversation and upsert its entry in the index (re-sorted by
 * recency). Returns the new index so callers can mirror it into React state.
 */
export function saveConversation(state: PersistedState): ConversationMeta[] {
  write(convKey(state.conversation.id), state)
  const meta = metaFromState(state)
  const index = [meta, ...loadIndex().filter(m => m.id !== meta.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt
  )
  saveIndex(index)
  return index
}

/** Delete one conversation (its state key + index entry). Returns the new index. */
export function deleteConversation(id: string): ConversationMeta[] {
  remove(convKey(id))
  const index = loadIndex().filter(m => m.id !== id)
  saveIndex(index)
  if (loadLastActiveId() === id) remove(LAST_ACTIVE_KEY)
  return index
}

// ── Last-active pointer ───────────────────────────────────────────────────────

export function loadLastActiveId(): string | null {
  return read<string>(LAST_ACTIVE_KEY)
}

export function saveLastActiveId(id: string): void {
  write(LAST_ACTIVE_KEY, id)
}

// ── One-time migration from the old single-conversation key ────────────────────

/**
 * If the new index is empty but the old `branchchat:v1` blob exists, fold it into
 * the new layout (one conv key + one index entry + lastActive) and drop the old
 * key. No-op once migrated. Never loses the user's existing conversation.
 */
export function migrateLegacy(): void {
  if (loadIndex().length > 0) return
  const parsed = read<unknown>(LEGACY_KEY)
  if (!isValid(parsed)) return
  saveConversation(parsed)
  saveLastActiveId(parsed.conversation.id)
  remove(LEGACY_KEY)
}
