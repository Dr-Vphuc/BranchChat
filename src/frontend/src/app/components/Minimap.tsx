import { useRef } from 'react'
import { NodeData } from '../lib/types'
import { NODE_WIDTH, NODE_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, getBranchAccent } from '../lib/constants'

const MM_W = 190
const MM_H = 120
const MM_SCALE_X = MM_W / WORLD_WIDTH
const MM_SCALE_Y = MM_H / WORLD_HEIGHT

interface MinimapProps {
  nodes: NodeData[]
  offset: { x: number; y: number }
  scale: number
  viewportSize: { width: number; height: number }
  activePathIds: Set<string>
  onNavigate: (offset: { x: number; y: number }) => void
}

export function Minimap({
  nodes,
  offset,
  scale,
  viewportSize,
  activePathIds,
  onNavigate,
}: MinimapProps) {
  const mmRef = useRef<HTMLDivElement>(null)

  const vpWorldX = -offset.x / scale
  const vpWorldY = -offset.y / scale
  const vpWorldW = viewportSize.width / scale
  const vpWorldH = viewportSize.height / scale

  const vpMmX = vpWorldX * MM_SCALE_X
  const vpMmY = vpWorldY * MM_SCALE_Y
  const vpMmW = Math.max(vpWorldW * MM_SCALE_X, 10)
  const vpMmH = Math.max(vpWorldH * MM_SCALE_Y, 8)

  const handleClick = (e: React.MouseEvent) => {
    if (!mmRef.current) return
    const rect = mmRef.current.getBoundingClientRect()
    const mmX = e.clientX - rect.left
    const mmY = e.clientY - rect.top
    const worldX = mmX / MM_SCALE_X
    const worldY = mmY / MM_SCALE_Y
    onNavigate({
      x: viewportSize.width / 2 - worldX * scale,
      y: viewportSize.height / 2 - worldY * scale,
    })
  }

  return (
    <div
      ref={mmRef}
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: MM_W,
        height: MM_H,
        backgroundColor: 'rgba(10, 10, 14, 0.94)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'crosshair',
        zIndex: 200,
        userSelect: 'none',
      }}
    >
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '10px 10px',
          pointerEvents: 'none',
        }}
      />

      {/* Node rectangles */}
      {nodes.map(node => {
        const nx = node.x * MM_SCALE_X
        const ny = node.y * MM_SCALE_Y
        const nw = Math.max(NODE_WIDTH * MM_SCALE_X, 3)
        const nh = Math.max(NODE_HEIGHT * MM_SCALE_Y, 2)
        const accent = getBranchAccent(node.branchDepth)
        const isOnPath = activePathIds.has(node.id)
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: nx,
              top: ny,
              width: nw,
              height: nh,
              backgroundColor: isOnPath ? `${accent}45` : `${accent}18`,
              borderRadius: 1,
              border: isOnPath ? `0.5px solid ${accent}60` : 'none',
              transition: 'background-color 0.2s',
            }}
          />
        )
      })}

      {/* Viewport rect */}
      <div
        style={{
          position: 'absolute',
          left: vpMmX,
          top: vpMmY,
          width: vpMmW,
          height: vpMmH,
          border: '1px solid rgba(245, 158, 11, 0.45)',
          backgroundColor: 'rgba(245, 158, 11, 0.04)',
          borderRadius: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 7.5,
          color: 'rgba(255,255,255,0.18)',
          pointerEvents: 'none',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        overview
      </div>
    </div>
  )
}
