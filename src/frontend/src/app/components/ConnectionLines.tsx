import { ConversationNode } from '../lib/types'
import { NODE_WIDTH, NODE_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, getBranchAccent } from '../lib/constants'

interface ConnectionLinesProps {
  nodes: ConversationNode[]
  depthMap: Map<string, number>
  activePathIds: Set<string>
}

function buildPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  isVertical: boolean
): string {
  if (isVertical) {
    const mid = (sy + ty) / 2
    return `M ${sx} ${sy} C ${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty}`
  } else {
    const midX = (sx + tx) / 2
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`
  }
}

export function ConnectionLines({ nodes, depthMap, activePathIds }: ConnectionLinesProps) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const connections = nodes
    .filter(n => n.parentId !== null)
    .map(n => ({ child: n, parent: nodeMap.get(n.parentId!) }))
    .filter((c): c is { child: ConversationNode; parent: ConversationNode } => c.parent !== undefined)

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <defs>
        <filter id="glow-amber">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-blue">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {connections.map(({ parent, child }) => {
        const isVertical = child.edgeKind === 'continue'

        let sx: number, sy: number, tx: number, ty: number
        if (isVertical) {
          sx = parent.position.x + NODE_WIDTH / 2
          sy = parent.position.y + NODE_HEIGHT
          tx = child.position.x + NODE_WIDTH / 2
          ty = child.position.y
        } else {
          sx = parent.position.x + NODE_WIDTH
          sy = parent.position.y + NODE_HEIGHT / 2
          tx = child.position.x
          ty = child.position.y + NODE_HEIGHT / 2
        }

        const isOnPath = activePathIds.has(parent.id) && activePathIds.has(child.id)
        const accent = getBranchAccent(depthMap.get(child.id) ?? 0)
        const pathD = buildPath(sx, sy, tx, ty, isVertical)

        return (
          <g key={`${parent.id}-${child.id}`}>
            {/* Ambient/dim line always present */}
            <path
              d={pathD}
              fill="none"
              stroke={accent}
              strokeWidth={1}
              strokeOpacity={isOnPath ? 0 : 0.1}
              strokeDasharray="5 5"
            />
            {/* Active path line */}
            {isOnPath && (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  strokeOpacity={0.2}
                  filter={`url(#glow-amber)`}
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
                {/* Moving dot along the path */}
                <circle r={2.5} fill={accent} opacity={0.8}>
                  <animateMotion dur="2.4s" repeatCount="indefinite" calcMode="linear">
                    <mpath href={`#path-${parent.id}-${child.id}`} />
                  </animateMotion>
                </circle>
                <path
                  id={`path-${parent.id}-${child.id}`}
                  d={pathD}
                  fill="none"
                  stroke="none"
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
