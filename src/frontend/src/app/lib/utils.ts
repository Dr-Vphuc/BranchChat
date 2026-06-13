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

// ── Mock answer generation (placeholder until a real LLM is wired in) ──────────

const AI_RESPONSES = [
  `The question touches on a fundamental tension in how we model complex adaptive systems. At the core, there's an interplay between local rules and global order — small-scale interactions that, when iterated across many agents, produce emergent structures irreducible to any single part. The challenge is always the same: bridging the descriptive (what patterns arise?) with the explanatory (why this pattern and not another?).`,
  `This is where the formalism starts to strain. The mathematical tools we have — information theory, dynamical systems, network science — capture correlates of the phenomenon without touching the generative mechanism. It's like having a detailed map of the terrain without a theory of plate tectonics. The map is useful, but doesn't explain why the mountains are where they are.`,
  `There's a useful distinction between weak and strong emergence here. Weak emergence means the property is in principle derivable from the lower-level description — just computationally expensive. Strong emergence means it genuinely can't be so derived, that something irreducibly new appears at the higher level. Most scientists are skeptical of strong emergence, but consciousness is the one case where the skepticism starts to feel like wishful thinking.`,
  `The problem is that our intuitions about causation are shaped by the macroscopic world. We expect causes to be local, contiguous, and proportional. Emergent phenomena violate all three: they're globally distributed, arise discontinuously, and small perturbations can have disproportionate effects. A better framework might need to abandon the folk-physics notion of causation entirely.`,
  `One productive angle: consider the difference between a system that processes information and one that integrates it. Processing can be fully decomposed into modular pipelines. Integration means the whole genuinely exceeds the sum of parts — the system's current state depends not just on inputs, but on its own history of self-reference. This is arguably what distinguishes a thermostat from a mind.`,
]

export function generateAnswer(_question: string): string {
  return AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)]
}
