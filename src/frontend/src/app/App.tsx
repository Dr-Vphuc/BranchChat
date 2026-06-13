import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2, GitBranch, ChevronRight, Trash2, MessageSquarePlus } from 'lucide-react'
import { ChatNode } from './components/ChatNode'
import { ConnectionLines } from './components/ConnectionLines'
import { Minimap } from './components/Minimap'
import { InputBar } from './components/InputBar'
import { ConversationNode, Conversation, EdgeKind, PendingInput } from './lib/types'
import { NODE_WIDTH, NODE_HEIGHT, BRANCH_GAP_X, MAIN_GAP_Y, BRANCH_SPACING_Y } from './lib/constants'
import { getPathToRoot, getChainToRoot, assembleContext, buildDepthMap, nodeQuestion } from './lib/utils'
import { loadState, saveState, clearState } from './lib/storage'
import { streamChat, DEFAULT_MODEL } from './lib/api'

const ACCENT_MAIN_COLOR = '#f59e0b'

export default function App() {
  // Read any persisted session once. Empty/absent → blank start.
  const [loaded] = useState(() => loadState())

  const [nodes, setNodes] = useState<ConversationNode[]>(() => loaded?.conversation.nodes ?? [])
  const [offset, setOffset] = useState(() => loaded?.viewport.offset ?? { x: 60, y: 60 })
  const [scale, setScale] = useState(() => loaded?.viewport.scale ?? 0.85)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(() => loaded?.activeNodeId ?? null)
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null)
  const [creatingRoot, setCreatingRoot] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 })
  // Transient streaming state, keyed by node id — never persisted.
  const [streaming, setStreaming] = useState<Record<string, { isTyping: boolean; error?: string }>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ startX: 0, startY: 0, startOX: 0, startOY: 0, moved: false })
  const currentScale = useRef(scale)
  currentScale.current = scale
  const currentOffset = useRef(offset)
  currentOffset.current = offset
  // Stable conversation identity (id + createdAt) for persistence.
  const convMeta = useRef({
    id: loaded?.conversation.id ?? crypto.randomUUID(),
    createdAt: loaded?.conversation.createdAt ?? Date.now(),
  })

  const activePath = getPathToRoot(activeNodeId ?? '', nodes)
  const breadcrumbChain = getChainToRoot(activeNodeId ?? '', nodes)
  const depthMap = buildDepthMap(nodes)

  // Sync viewport size
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setViewportSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  // Inject global styles
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes bc-cursor-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      @keyframes bc-slide-up {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      * { box-sizing: border-box; }
      ::placeholder { color: rgba(255,255,255,0.22) !important; }
      ::-webkit-scrollbar { display: none; }
      * { scrollbar-width: none; }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node]')) return
    if (e.button !== 0) return
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOX: currentOffset.current.x,
      startOY: currentOffset.current.y,
      moved: false,
    }
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    if (Math.abs(dx) + Math.abs(dy) > 2) dragState.current.moved = true
    setOffset({
      x: dragState.current.startOX + dx,
      y: dragState.current.startOY + dy,
    })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.92 : 1.09
    const newScale = Math.max(0.18, Math.min(2.4, currentScale.current * factor))
    setOffset(prev => ({
      x: cx - (cx - prev.x) * (newScale / currentScale.current),
      y: cy - (cy - prev.y) * (newScale / currentScale.current),
    }))
    setScale(newScale)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const zoomBy = useCallback((factor: number) => {
    const cx = viewportSize.width / 2
    const cy = viewportSize.height / 2
    const newScale = Math.max(0.18, Math.min(2.4, currentScale.current * factor))
    setOffset(prev => ({
      x: cx - (cx - prev.x) * (newScale / currentScale.current),
      y: cy - (cy - prev.y) * (newScale / currentScale.current),
    }))
    setScale(newScale)
  }, [viewportSize])

  const fitToScreen = useCallback(() => {
    if (nodes.length === 0) return
    const xs = nodes.map(n => n.position.x)
    const ys = nodes.map(n => n.position.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs) + NODE_WIDTH
    const maxY = Math.max(...ys) + NODE_HEIGHT
    const contentW = maxX - minX
    const contentH = maxY - minY
    const pad = 100
    const newScale = Math.min(
      (viewportSize.width - pad * 2) / contentW,
      (viewportSize.height - pad * 2) / contentH,
      1.2
    )
    setScale(newScale)
    setOffset({
      x: pad + (viewportSize.width - pad * 2 - contentW * newScale) / 2 - minX * newScale,
      y: pad + (viewportSize.height - pad * 2 - contentH * newScale) / 2 - minY * newScale,
    })
  }, [nodes, viewportSize])

  const panToNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setOffset({
      x: viewportSize.width / 2 - (node.position.x + NODE_WIDTH / 2) * currentScale.current,
      y: viewportSize.height / 3 - (node.position.y + NODE_HEIGHT / 3) * currentScale.current,
    })
  }, [nodes, viewportSize])

  const centerOnWorld = useCallback((x: number, y: number) => {
    setOffset({
      x: viewportSize.width / 2 - (x + NODE_WIDTH / 2) * currentScale.current,
      y: viewportSize.height / 3 - (y + NODE_HEIGHT / 3) * currentScale.current,
    })
  }, [viewportSize])

  // Build a one-exchange node: the user question + an empty assistant message
  // that the LLM stream fills in.
  const buildExchangeNode = useCallback((
    id: string,
    parentId: string | null,
    edgeKind: EdgeKind,
    position: { x: number; y: number },
    question: string,
  ): ConversationNode => {
    const now = Date.now()
    return {
      id,
      parentId,
      edgeKind,
      position,
      messages: [
        { id: `${id}-u`, role: 'user', content: question, createdAt: now },
        { id: `${id}-a`, role: 'assistant', content: '', model: DEFAULT_MODEL, createdAt: now + 1 },
      ],
    }
  }, [])

  // Stream the assistant answer for a node, appending tokens to its message as
  // they arrive. `context` is the root→node chain (empty messages stripped).
  const runLLM = useCallback(async (nodeId: string, context: { role: 'user' | 'assistant' | 'system'; content: string }[]) => {
    setStreaming(prev => ({ ...prev, [nodeId]: { isTyping: true } }))
    try {
      for await (const delta of streamChat(context)) {
        setNodes(prev => prev.map(n =>
          n.id === nodeId
            ? {
                ...n,
                messages: n.messages.map(m =>
                  m.role === 'assistant' ? { ...m, content: m.content + delta } : m
                ),
              }
            : n
        ))
      }
      setStreaming(prev => ({ ...prev, [nodeId]: { isTyping: false } }))
    } catch (e) {
      setStreaming(prev => ({ ...prev, [nodeId]: { isTyping: false, error: e instanceof Error ? e.message : String(e) } }))
    }
  }, [])

  // Assemble the LLM context for a freshly-created node from a node list,
  // dropping the empty assistant placeholder just added.
  const buildContext = useCallback((nodeId: string, nodeList: ConversationNode[]) =>
    assembleContext(nodeId, nodeList)
      .filter(m => m.content.trim().length > 0)
      .map(m => ({ role: m.role, content: m.content })),
  [])

  // Create the first node of an empty canvas (no parent).
  const handleCreateRoot = useCallback((question: string) => {
    const newId = crypto.randomUUID()
    const position = { x: 120, y: 120 }
    const newNode = buildExchangeNode(newId, null, 'continue', position, question)
    setNodes([newNode])
    setActiveNodeId(newId)
    setCreatingRoot(false)
    runLLM(newId, buildContext(newId, [newNode]))
    setTimeout(() => centerOnWorld(position.x, position.y), 80)
  }, [buildExchangeNode, runLLM, buildContext, centerOnWorld])

  // Wipe everything back to a blank canvas.
  const handleClear = useCallback(() => {
    clearState()
    setNodes([])
    setActiveNodeId(null)
    setStreaming({})
    setPendingInput(null)
    setCreatingRoot(false)
    setOffset({ x: 60, y: 60 })
    setScale(0.85)
    convMeta.current = { id: crypto.randomUUID(), createdAt: Date.now() }
  }, [])

  // Branch creation
  const handleSubmit = useCallback((question: string) => {
    if (!pendingInput) return
    const parentNode = nodes.find(n => n.id === pendingInput.parentId)
    if (!parentNode) return

    let newX: number, newY: number

    if (pendingInput.mode === 'continue') {
      // Continue down: create child node directly below parent (same X column)
      newX = parentNode.position.x

      // Find all descendants in the same column
      const sameColumnDescendants = nodes.filter(n => {
        if (n.position.x !== parentNode.position.x) return false
        // Check if this node is a descendant of parentNode
        let current = nodes.find(p => p.id === n.parentId)
        while (current) {
          if (current.id === parentNode.id) return true
          current = nodes.find(p => p.id === current!.parentId)
        }
        return false
      })

      const maxDescendantY = sameColumnDescendants.length > 0
        ? Math.max(...sameColumnDescendants.map(n => n.position.y))
        : parentNode.position.y
      newY = maxDescendantY + NODE_HEIGHT + MAIN_GAP_Y
    } else {
      // Branch right: create new branch to the right of parent
      const branchX = parentNode.position.x + NODE_WIDTH + BRANCH_GAP_X
      newX = branchX

      // Find all existing branches at the same level (same parentId, same X distance from parent)
      const existingBranches = nodes.filter(n =>
        n.parentId === parentNode.id && Math.abs(n.position.x - branchX) < 10
      )

      // Calculate Y position for the new branch based on total number of branches
      const totalBranches = existingBranches.length + 1 // including the new one

      // Calculate total vertical space needed
      const totalHeight = (totalBranches - 1) * (NODE_HEIGHT + BRANCH_SPACING_Y)
      const startY = parentNode.position.y - totalHeight / 2

      // The new branch will be at the end (for now, we'll recalculate all positions)
      newY = startY + existingBranches.length * (NODE_HEIGHT + BRANCH_SPACING_Y)
    }

    const newId = crypto.randomUUID()
    const newNode = buildExchangeNode(newId, pendingInput.parentId, pendingInput.mode, { x: newX, y: newY }, question)

    setNodes(prev => {
      const updated = [...prev, newNode]

      const getDescendants = (nodeId: string, nodeList: ConversationNode[]): Set<string> => {
        const result = new Set<string>()
        const queue = [nodeId]
        while (queue.length > 0) {
          const curr = queue.shift()!
          nodeList.filter(n => n.parentId === curr).forEach(child => {
            result.add(child.id)
            queue.push(child.id)
          })
        }
        return result
      }

      // 'continue' mode: if a sibling branch below parentNode would overlap with
      // the new child, shift that sibling (and its subtree) one column to the right
      if (pendingInput.mode === 'continue' && parentNode.parentId) {
        const conflictingSiblings = updated.filter(n =>
          n.parentId === parentNode.parentId &&
          Math.abs(n.position.x - parentNode.position.x) < 10 &&
          n.id !== parentNode.id &&
          n.position.y > parentNode.position.y &&
          n.position.y < newY + NODE_HEIGHT + MAIN_GAP_Y
        )

        if (conflictingSiblings.length > 0) {
          const xShift = NODE_WIDTH + BRANCH_GAP_X
          const shiftRightSet = new Set<string>()
          conflictingSiblings.forEach(sib => {
            shiftRightSet.add(sib.id)
            getDescendants(sib.id, updated).forEach(id => shiftRightSet.add(id))
          })
          return updated.map(node =>
            shiftRightSet.has(node.id)
              ? { ...node, position: { ...node.position, x: node.position.x + xShift } }
              : node
          )
        }
      }

      if (pendingInput.mode === 'branch') {
        const branchX = parentNode.position.x + NODE_WIDTH + BRANCH_GAP_X
        const allBranches = updated.filter(n =>
          n.parentId === parentNode.id && Math.abs(n.position.x - branchX) < 10
        )

        const totalBranches = allBranches.length
        const totalHeight = (totalBranches - 1) * (NODE_HEIGHT + BRANCH_SPACING_Y)
        const startY = parentNode.position.y - totalHeight / 2

        // Precompute branch offsets and their descendant sets
        const branchOffsets = new Map<string, number>()
        const branchDescendants = new Map<string, Set<string>>()
        allBranches.forEach((branch, index) => {
          const newBranchY = startY + index * (NODE_HEIGHT + BRANCH_SPACING_Y)
          branchOffsets.set(branch.id, newBranchY - branch.position.y)
          branchDescendants.set(branch.id, getDescendants(branch.id, updated))
        })

        // Vertical extent of the entire branch cluster
        const topBranchY = startY
        const bottomBranchEdge = startY + totalHeight + NODE_HEIGHT

        // Find adjacent nodes in same column as parent
        const sameColNodes = updated.filter(n =>
          Math.abs(n.position.x - parentNode.position.x) < 10 && n.id !== parentNode.id
        )
        const nodeAbove = sameColNodes
          .filter(n => n.position.y < parentNode.position.y)
          .reduce<ConversationNode | null>((best, n) => (!best || n.position.y > best.position.y) ? n : best, null)
        const nodeBelow = sameColNodes
          .filter(n => n.position.y > parentNode.position.y)
          .reduce<ConversationNode | null>((best, n) => (!best || n.position.y < best.position.y) ? n : best, null)

        // How much space is missing above/below the branch cluster
        let upwardShift = 0
        if (nodeAbove) {
          const gap = topBranchY - MAIN_GAP_Y - (nodeAbove.position.y + NODE_HEIGHT)
          if (gap < 0) upwardShift = -gap
        }
        let downwardShift = 0
        if (nodeBelow) {
          const gap = nodeBelow.position.y - (bottomBranchEdge + MAIN_GAP_Y)
          if (gap < 0) downwardShift = -gap
        }

        // Subtree rooted at parentNode (do not move these when pushing ancestors)
        const parentSubtree = getDescendants(parentNode.id, updated)
        parentSubtree.add(parentNode.id)

        // Collect all ancestors of parentNode + their other descendants → push up
        const pushUpSet = new Set<string>()
        if (upwardShift > 0) {
          let curr: ConversationNode | undefined = updated.find(n => n.id === parentNode.parentId)
          const visited = new Set<string>()
          while (curr && !visited.has(curr.id)) {
            visited.add(curr.id)
            pushUpSet.add(curr.id)
            getDescendants(curr.id, updated).forEach(dId => {
              if (!parentSubtree.has(dId)) pushUpSet.add(dId)
            })
            curr = updated.find(n => n.id === curr!.parentId)
          }
        }

        // nodeBelow and all its descendants → push down
        const pushDownSet = new Set<string>()
        if (downwardShift > 0 && nodeBelow) {
          pushDownSet.add(nodeBelow.id)
          getDescendants(nodeBelow.id, updated).forEach(id => pushDownSet.add(id))
        }

        return updated.map(node => {
          // Branch repositioning takes priority
          for (const [branchId, deltaY] of branchOffsets.entries()) {
            if (node.id === branchId || branchDescendants.get(branchId)?.has(node.id)) {
              return { ...node, position: { ...node.position, y: node.position.y + deltaY } }
            }
          }
          if (pushUpSet.has(node.id))
            return { ...node, position: { ...node.position, y: node.position.y - upwardShift } }
          if (pushDownSet.has(node.id))
            return { ...node, position: { ...node.position, y: node.position.y + downwardShift } }
          return node
        })
      }

      return updated
    })
    setActiveNodeId(newId)
    setPendingInput(null)

    runLLM(newId, buildContext(newId, [...nodes, newNode]))

    // Pan to new node
    setTimeout(() => {
      const screenX = newX * currentScale.current + currentOffset.current.x
      const screenY = newY * currentScale.current + currentOffset.current.y
      const vw = viewportSize.width
      const vh = viewportSize.height
      if (screenX > vw - 480 || screenX < 80 || screenY > vh - 360 || screenY < 80) {
        setOffset({
          x: vw / 2 - (newX + NODE_WIDTH / 2) * currentScale.current,
          y: vh / 3 - (newY + NODE_HEIGHT / 3) * currentScale.current,
        })
      }
    }, 80)
  }, [pendingInput, nodes, viewportSize, buildExchangeNode, runLLM, buildContext])

  // Auto-save the session (debounced) whenever the tree or view changes.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const root = nodes.find(n => n.parentId === null)
      const rootQ = root ? nodeQuestion(root) : ''
      const title = rootQ ? (rootQ.length > 40 ? rootQ.slice(0, 40) + '…' : rootQ) : 'Untitled'
      const conversation: Conversation = {
        id: convMeta.current.id,
        title,
        rootId: root?.id ?? '',
        nodes,
        createdAt: convMeta.current.createdAt,
        updatedAt: Date.now(),
      }
      saveState({ version: 1, conversation, viewport: { offset, scale }, activeNodeId })
    }, 400)
    return () => window.clearTimeout(handle)
  }, [nodes, offset, scale, activeNodeId])

  // Dot grid background follows pan/zoom
  const dotSpacing = 28 * scale
  const dotOffsetX = ((offset.x % dotSpacing) + dotSpacing) % dotSpacing
  const dotOffsetY = ((offset.y % dotSpacing) + dotSpacing) % dotSpacing

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#0c0c10',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Canvas viewport */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Dot grid — viewport space */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)',
            backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
            backgroundPosition: `${dotOffsetX}px ${dotOffsetY}px`,
            pointerEvents: 'none',
          }}
        />

        {/* World — transformed by pan/zoom */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          {/* SVG connector lines */}
          <ConnectionLines nodes={nodes} depthMap={depthMap} activePathIds={activePath} />

          {/* Chat nodes */}
          {nodes.map(node => (
            <ChatNode
              key={node.id}
              node={node}
              branchDepth={depthMap.get(node.id) ?? 0}
              isActive={activeNodeId === node.id}
              isOnActivePath={activePath.has(node.id)}
              streaming={streaming[node.id]}
              onActivate={setActiveNodeId}
              onBranch={id => setPendingInput({ parentId: id, mode: 'branch' })}
              onContinue={id => setPendingInput({ parentId: id, mode: 'continue' })}
            />
          ))}
        </div>
      </div>

      {/* Empty state — blank canvas needs a way to create the first node */}
      {nodes.length === 0 && !creatingRoot && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              pointerEvents: 'auto',
            }}
          >
            <MessageSquarePlus size={34} color="rgba(245,158,11,0.45)" strokeWidth={1.5} />
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13.5,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.01em',
              }}
            >
              No conversation yet
            </div>
            <button
              onClick={() => setCreatingRoot(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                backgroundColor: '#f59e0b',
                border: 'none',
                borderRadius: 5,
                padding: '8px 16px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12.5,
                fontWeight: 500,
                color: '#0c0c10',
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              <MessageSquarePlus size={13} strokeWidth={2} />
              Start a conversation
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          backgroundColor: 'rgba(10, 10, 14, 0.88)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          zIndex: 100,
          pointerEvents: 'none',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            pointerEvents: 'auto',
          }}
        >
          <GitBranch size={14} color={ACCENT_MAIN_COLOR} strokeWidth={2} />
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: ACCENT_MAIN_COLOR,
              letterSpacing: '0.04em',
            }}
          >
            BranchChat
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.08)' }} />

        {/* Breadcrumb path */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {breadcrumbChain.map((node, i) => (
            <div
              key={node.id}
              style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 0 }}
            >
              {i > 0 && (
                <ChevronRight
                  size={10}
                  style={{ flexShrink: 0, color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}
                />
              )}
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color:
                    node.id === activeNodeId
                      ? ACCENT_MAIN_COLOR
                      : 'rgba(255,255,255,0.38)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 160,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  padding: '2px 4px',
                  borderRadius: 3,
                  transition: 'color 0.15s',
                }}
                onClick={() => {
                  setActiveNodeId(node.id)
                  panToNode(node.id)
                }}
              >
                {(() => {
                  const q = nodeQuestion(node)
                  return q.length > 28 ? q.slice(0, 28) + '…' : q
                })()}
              </span>
            </div>
          ))}
        </div>

        {/* Node count */}
        <div
          style={{
            marginLeft: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: '0.04em',
          }}
        >
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </div>

        {/* Clear / start over */}
        {nodes.length > 0 && (
          <button
            onClick={handleClear}
            title="Clear canvas"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '3px 8px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10.5,
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,0.4)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            <Trash2 size={11} strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: 'fixed',
          bottom: 152,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 200,
        }}
      >
        {[
          { icon: <ZoomIn size={13} strokeWidth={2} />, action: () => zoomBy(1.2), title: 'Zoom in' },
          { icon: <ZoomOut size={13} strokeWidth={2} />, action: () => zoomBy(0.8), title: 'Zoom out' },
          { icon: <Maximize2 size={12} strokeWidth={2} />, action: fitToScreen, title: 'Fit to screen' },
        ].map(({ icon, action, title }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            style={{
              width: 30,
              height: 30,
              backgroundColor: 'rgba(10, 10, 14, 0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = ACCENT_MAIN_COLOR
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${ACCENT_MAIN_COLOR}40`
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            {icon}
          </button>
        ))}

        {/* Zoom label */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: 'rgba(255,255,255,0.22)',
            marginTop: 2,
            letterSpacing: '0.04em',
          }}
        >
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Minimap */}
      <Minimap
        nodes={nodes}
        depthMap={depthMap}
        offset={offset}
        scale={scale}
        viewportSize={viewportSize}
        activePathIds={activePath}
        onNavigate={setOffset}
      />

      {/* Input bar — branch/continue from an existing node */}
      {pendingInput && (() => {
        const parentNode = nodes.find(n => n.id === pendingInput.parentId)
        if (!parentNode) return null
        return (
          <InputBar
            parentNode={parentNode}
            mode={pendingInput.mode}
            onSubmit={handleSubmit}
            onCancel={() => setPendingInput(null)}
          />
        )
      })()}

      {/* Input bar — create the first node */}
      {creatingRoot && (
        <InputBar
          mode="root"
          onSubmit={handleCreateRoot}
          onCancel={() => setCreatingRoot(false)}
        />
      )}
    </div>
  )
}
