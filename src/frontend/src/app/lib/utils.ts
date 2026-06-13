import { ConversationNode, Message } from './types'

// ── Tree traversal ───────────────────────────────────────────────────────────

export function getPathToRoot(nodeId: string, nodes: ConversationNode[]): Set<string> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const path = new Set<string>()
  let current: ConversationNode | undefined = nodeMap.get(nodeId)
  while (current) {
    path.add(current.id)
    current = current.parentId ? nodeMap.get(current.parentId) : undefined
  }
  return path
}

export function getChainToRoot(nodeId: string, nodes: ConversationNode[]): ConversationNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const chain: ConversationNode[] = []
  let current: ConversationNode | undefined = nodeMap.get(nodeId)
  while (current) {
    chain.unshift(current)
    current = current.parentId ? nodeMap.get(current.parentId) : undefined
  }
  return chain
}

// ── Derived values (computed from the tree, never stored) ─────────────────────

/** Branch depth = number of 'branch' edges on the path from this node to root. */
export function getBranchDepth(nodeId: string, nodes: ConversationNode[]): number {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  let depth = 0
  let current: ConversationNode | undefined = nodeMap.get(nodeId)
  while (current && current.parentId) {
    if (current.edgeKind === 'branch') depth++
    current = nodeMap.get(current.parentId)
  }
  return depth
}

export function isMainThread(nodeId: string, nodes: ConversationNode[]): boolean {
  return getBranchDepth(nodeId, nodes) === 0
}

/** Branch depth for every node, computed in one memoized pass. */
export function buildDepthMap(nodes: ConversationNode[]): Map<string, number> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const memo = new Map<string, number>()
  const depthOf = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const node = nodeMap.get(id)
    if (!node || !node.parentId) {
      memo.set(id, 0)
      return 0
    }
    const d = (node.edgeKind === 'branch' ? 1 : 0) + depthOf(node.parentId)
    memo.set(id, d)
    return d
  }
  nodes.forEach(n => depthOf(n.id))
  return memo
}

// ── Context assembly (the core of branch-chat) ────────────────────────────────

/** Messages from root → node in order — ready to send to an LLM. */
export function assembleContext(nodeId: string, nodes: ConversationNode[]): Message[] {
  return getChainToRoot(nodeId, nodes).flatMap(n => n.messages)
}

// ── Message accessors (a card shows the user/assistant pair) ───────────────────

export function nodeQuestion(node: ConversationNode): string {
  return node.messages.find(m => m.role === 'user')?.content ?? ''
}

export function nodeAnswer(node: ConversationNode): string {
  return node.messages.find(m => m.role === 'assistant')?.content ?? ''
}
