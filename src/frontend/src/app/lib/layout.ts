import { ConversationNode } from './types'
import { NODE_WIDTH, NODE_HEIGHT, BRANCH_GAP_X, MAIN_GAP_Y } from './constants'
import { buildDepthMap } from './utils'

// Horizontal step per branch depth. Wider than a card so adjacent columns never
// touch — which means two cards can only overlap WITHIN the same column.
const COLUMN_DX = NODE_WIDTH + BRANCH_GAP_X
// Vertical gap kept between two distinct subtrees that share a column.
const V_GAP = MAIN_GAP_Y
// Origin of the whole tree in world space.
const OX = 120
const OY = 120

type Segment = { top: number; bottom: number }
type Contour = Map<number, Segment> // keyed by column (= branch depth)

interface SubtreeLayout {
  rel: Map<string, number> // node id → y relative to this subtree's root (root at 0)
  contour: Contour
}

/**
 * Pure layout: derive every node's {x,y} from the tree structure alone, recomputed
 * whenever the tree changes. Positions are never stored.
 *
 * No-overlap guarantee: x is fixed by branch depth (column) and columns are spaced
 * wider than a card, so overlaps are only possible within a column — and the
 * per-column contour packing below makes that impossible too.
 *
 * Per node: branch children hang top-aligned to the right (creation order, older on
 * top); the continue child (main line) sits below them, pushed down only as much as
 * the shared columns actually require.
 */
export function computeLayout(nodes: ConversationNode[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return out

  const depthMap = buildDepthMap(nodes)
  const idSet = new Set(nodes.map(n => n.id))

  // Children grouped by parent, preserving array order (= creation order).
  const branchChildren = new Map<string, ConversationNode[]>()
  const continueChildren = new Map<string, ConversationNode[]>()
  for (const n of nodes) {
    if (n.parentId === null) continue
    const bucket = n.edgeKind === 'branch' ? branchChildren : continueChildren
    const list = bucket.get(n.parentId)
    if (list) list.push(n)
    else bucket.set(n.parentId, [n])
  }

  const layoutSubtree = (node: ConversationNode): SubtreeLayout => {
    const c = depthMap.get(node.id) ?? 0
    const rel = new Map<string, number>([[node.id, 0]])
    const contour: Contour = new Map([[c, { top: 0, bottom: NODE_HEIGHT }]])

    const ordered = [
      ...(branchChildren.get(node.id) ?? []),
      ...(continueChildren.get(node.id) ?? []),
    ]

    for (const child of ordered) {
      const sub = layoutSubtree(child)

      // Minimal downward shift so the child clears the accumulated contour,
      // checked per shared column.
      let delta = 0
      for (const [col, seg] of sub.contour) {
        const acc = contour.get(col)
        if (acc) delta = Math.max(delta, acc.bottom + V_GAP - seg.top)
      }

      // Merge the shifted child into rel + contour.
      for (const [id, y] of sub.rel) rel.set(id, y + delta)
      for (const [col, seg] of sub.contour) {
        const shifted = { top: seg.top + delta, bottom: seg.bottom + delta }
        const acc = contour.get(col)
        contour.set(
          col,
          acc
            ? { top: Math.min(acc.top, shifted.top), bottom: Math.max(acc.bottom, shifted.bottom) }
            : shifted
        )
      }
    }

    return { rel, contour }
  }

  // Lay out each root (normally one). Orphans — a node whose parent is missing —
  // are treated as roots so they still get a position. Extra roots stack below.
  const roots = nodes.filter(n => n.parentId === null || !idSet.has(n.parentId))
  let stackTop = 0
  for (const root of roots) {
    const { rel, contour } = layoutSubtree(root)
    for (const [id, relY] of rel) {
      const c = depthMap.get(id) ?? 0
      out.set(id, { x: c * COLUMN_DX + OX, y: relY + stackTop + OY })
    }
    let maxBottom = 0
    for (const seg of contour.values()) maxBottom = Math.max(maxBottom, seg.bottom)
    stackTop += maxBottom + V_GAP
  }

  return out
}
