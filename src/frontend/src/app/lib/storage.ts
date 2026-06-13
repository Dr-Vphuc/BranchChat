import { Conversation } from './types'

// Bump the version (and the key suffix) when the persisted shape changes
// incompatibly, so old data is ignored rather than mis-read.
const STORAGE_KEY = 'branchchat:v1'

/** Everything needed to restore a working session from localStorage. */
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

/** Read persisted state. Returns null on absence, parse error, or shape/version mismatch. */
export function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Persist state. Swallows quota/serialization errors. */
export function saveState(state: PersistedState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore (e.g. storage full or disabled)
  }
}

/** Remove persisted state — used by "Clear" to start over. */
export function clearState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
