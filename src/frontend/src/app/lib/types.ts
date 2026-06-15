// ── Domain layer ────────────────────────────────────────────────────────────
// Persisted business objects store only the conversation STRUCTURE. Layout is a
// pure function of that structure (see lib/layout) — recomputed on every change,
// never stored — so cards can never overlap and re-arrange themselves on edits.
// Transient UI state (typing animation) is held separately in App state. Derived
// values (branchDepth, isMainThread, position) are computed, never stored.

/** A point in world space. */
export interface Point {
  x: number
  y: number
}

/** Who produced a message. Aligned with the LLM API message format. */
export type Role = 'user' | 'assistant' | 'system'

/** Atomic unit of conversation — one utterance by one role. */
export interface Message {
  id: string
  role: Role
  content: string
  /** Model that produced an assistant message (undefined for user/system). */
  model?: string
  createdAt: number
}

/** How a node relates to its parent. Replaces inferring the relation from x/y. */
export type EdgeKind = 'continue' | 'branch'

/** A card / vertex in the conversation tree. */
export interface ConversationNode {
  id: string
  parentId: string | null
  /** 'continue' for the root (unused for drawing — root has no incoming edge). */
  edgeKind: EdgeKind
  /** Usually [user, assistant]; an array to allow tool/multi-part turns later. */
  messages: Message[]
}

/** A node with its derived layout attached — produced for rendering only. */
export type PositionedNode = ConversationNode & { position: Point }

/** The whole conversation tree. */
export interface Conversation {
  id: string
  title: string
  rootId: string
  nodes: ConversationNode[]
  createdAt: number
  updatedAt: number
}

/** Transient pointer to where a new node will be created (drives the InputBar). */
export interface PendingInput {
  parentId: string
  mode: EdgeKind
}
