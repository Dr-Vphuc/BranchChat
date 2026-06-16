import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2, GitBranch, ChevronRight, Trash2, MessageSquarePlus, PanelLeft } from 'lucide-react'
import { ChatNode } from './components/ChatNode'
import { ConnectionLines } from './components/ConnectionLines'
import { Minimap } from './components/Minimap'
import { InputBar } from './components/InputBar'
import { DeleteConfirm } from './components/DeleteConfirm'
import { ConfirmDialog } from './components/ConfirmDialog'
import { CardContextMenu } from './components/CardContextMenu'
import { HistorySidebar } from './components/HistorySidebar'
import { ConversationNode, ConversationMeta, EdgeKind, Message, PendingInput, PositionedNode } from './lib/types'
import { NODE_WIDTH, NODE_HEIGHT, getBranchAccent } from './lib/constants'
import { getPathToRoot, getChainToRoot, assembleContext, buildDepthMap, nodeQuestion } from './lib/utils'
import { computeLayout } from './lib/layout'
import {
  PersistedState,
  bootstrapFromServer,
  loadConversation,
  saveConversation,
  deleteConversation,
  saveLastActiveId,
} from './lib/storage'
import { streamChat, DEFAULT_MODEL } from './lib/api'

const ACCENT_MAIN_COLOR = '#f59e0b'

/** A fresh, empty conversation (its own id) — the blank-canvas starting point. */
function blankPersisted(): PersistedState {
  const now = Date.now()
  return {
    version: 1,
    conversation: { id: crypto.randomUUID(), title: 'Untitled', rootId: '', nodes: [], createdAt: now, updatedAt: now },
    viewport: { offset: { x: 60, y: 60 }, scale: 0.85 },
    activeNodeId: null,
  }
}

export default function App() {
  // History + the open conversation load from the server on mount (see the
  // bootstrap effect below); until then we show a loading screen and keep state
  // empty. `loading` also gates autosave so it can't clobber server data.
  const [index, setIndex] = useState<ConversationMeta[]>([])
  const [currentConversationId, setCurrentConversationId] = useState('')
  const [loading, setLoading] = useState(true)

  const [nodes, setNodes] = useState<ConversationNode[]>([])
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 60, y: 60 })
  const [scale, setScale] = useState(0.85)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null)
  // Right-click card menu (screen coords) + internal card clipboard + edit target.
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [clipboard, setClipboard] = useState<Message[] | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteConvId, setPendingDeleteConvId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
  // createdAt of the open conversation (its id lives in currentConversationId state).
  const createdAtRef = useRef(Date.now())
  // Flipped true once the server bootstrap finishes — autosave stays off until then.
  const bootstrappedRef = useRef(false)
  // Mirror the index so the autosave effect can read it without subscribing (which
  // would re-fire the effect on every save and loop).
  const indexRef = useRef(index)
  indexRef.current = index

  const activePath = getPathToRoot(activeNodeId ?? '', nodes)
  const breadcrumbChain = getChainToRoot(activeNodeId ?? '', nodes)
  const depthMap = buildDepthMap(nodes)

  // Layout is derived purely from the tree structure and recomputed each render
  // (like depthMap above). Positions are never stored — cards re-arrange on edits.
  const layout = computeLayout(nodes)
  const positioned: PositionedNode[] = nodes.map(n => ({
    ...n,
    position: layout.get(n.id) ?? { x: 0, y: 0 },
  }))

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
      @keyframes bc-pop-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      * { box-sizing: border-box; }
      ::placeholder { color: rgba(255,255,255,0.22) !important; }
      ::-webkit-scrollbar { display: none; }
      * { scrollbar-width: none; }

      /* Rendered markdown inside a chat card — kept all-monospace to match the
         terminal look; only structure (headings, lists, code) is added. */
      .bc-md {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10.5px;
        line-height: 1.7;
        color: rgba(255,255,255,0.48);
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .bc-md > *:first-child { margin-top: 0; }
      .bc-md > *:last-child { margin-bottom: 0; }
      .bc-md p { margin: 0 0 8px; }
      .bc-md h1, .bc-md h2, .bc-md h3, .bc-md h4, .bc-md h5, .bc-md h6 {
        margin: 12px 0 6px;
        font-weight: 600;
        line-height: 1.35;
        color: rgba(255,255,255,0.72);
      }
      .bc-md h1 { font-size: 13px; }
      .bc-md h2 { font-size: 12px; }
      .bc-md h3 { font-size: 11px; }
      .bc-md h4, .bc-md h5, .bc-md h6 { font-size: 10.5px; }
      .bc-md ul, .bc-md ol { margin: 0 0 8px; padding-left: 18px; }
      .bc-md li { margin: 2px 0; }
      .bc-md li::marker { color: rgba(255,255,255,0.3); }
      .bc-md a { color: #f5a623; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
      .bc-md strong { font-weight: 700; color: rgba(255,255,255,0.8); }
      .bc-md em { font-style: italic; }
      .bc-md blockquote {
        margin: 8px 0;
        padding: 2px 0 2px 10px;
        border-left: 2px solid rgba(255,255,255,0.15);
        color: rgba(255,255,255,0.4);
      }
      .bc-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0; }
      .bc-md code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        background: rgba(255,255,255,0.08);
        padding: 1px 4px;
        border-radius: 3px;
        color: rgba(255,255,255,0.72);
      }
      .bc-md pre {
        margin: 8px 0;
        padding: 9px 11px;
        border-radius: 5px;
        background: #0d1117;
        border: 1px solid rgba(255,255,255,0.07);
        overflow-x: auto;
      }
      /* Inside a code block, let the highlight.js theme own the colors; just
         strip the per-block padding/background it would otherwise add. */
      .bc-md pre code {
        background: none;
        padding: 0;
        font-size: 10px;
        white-space: pre;
      }
      .bc-md table { border-collapse: collapse; margin: 8px 0; font-size: 10px; }
      .bc-md th, .bc-md td { border: 1px solid rgba(255,255,255,0.12); padding: 3px 7px; text-align: left; }
      .bc-md th { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.65); font-weight: 600; }
      .bc-md img { max-width: 100%; border-radius: 4px; }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
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
    // Never zoom while the pointer is over a card. Over its scrollable content,
    // let the browser scroll natively; over the rest of the card, swallow the
    // wheel so reaching the top/bottom doesn't jump into a canvas zoom.
    const target = e.target as Element
    if (target.closest('[data-node]')) {
      if (!target.closest('[data-scrollable]')) e.preventDefault()
      return
    }
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
    if (positioned.length === 0) return
    const xs = positioned.map(n => n.position.x)
    const ys = positioned.map(n => n.position.y)
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
  }, [positioned, viewportSize])

  const panToNode = useCallback((nodeId: string) => {
    const p = layout.get(nodeId)
    if (!p) return
    setOffset({
      x: viewportSize.width / 2 - (p.x + NODE_WIDTH / 2) * currentScale.current,
      y: viewportSize.height / 3 - (p.y + NODE_HEIGHT / 3) * currentScale.current,
    })
  }, [layout, viewportSize])

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
    question: string,
  ): ConversationNode => {
    const now = Date.now()
    return {
      id,
      parentId,
      edgeKind,
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
    const newNode = buildExchangeNode(newId, null, 'continue', question)
    setNodes([newNode])
    setActiveNodeId(newId)
    setCreatingRoot(false)
    runLLM(newId, buildContext(newId, [newNode]))
    setTimeout(() => {
      const p = computeLayout([newNode]).get(newId)
      if (p) centerOnWorld(p.x, p.y)
    }, 80)
  }, [buildExchangeNode, runLLM, buildContext, centerOnWorld])

  // Empty the CURRENT conversation in place — keep its id so it stays put in the
  // history (becomes an "Untitled" 0-card entry); autosave persists the blank state.
  const handleClear = useCallback(() => {
    setNodes([])
    setActiveNodeId(null)
    setStreaming({})
    setPendingInput(null)
    setCreatingRoot(false)
    setOffset({ x: 60, y: 60 })
    setScale(0.85)
  }, [])

  // ── Conversation switching / history ────────────────────────────────────────

  // Swap the canvas to a stored conversation's full state (and reset transient UI).
  const applyPersisted = useCallback((p: PersistedState) => {
    setNodes(p.conversation.nodes)
    setOffset(p.viewport.offset)
    setScale(p.viewport.scale)
    setActiveNodeId(p.activeNodeId)
    setCurrentConversationId(p.conversation.id)
    createdAtRef.current = p.conversation.createdAt
    setStreaming({})
    setPendingInput(null)
    setCreatingRoot(false)
  }, [])

  // Build the persisted snapshot of the current canvas (title derived from root Q).
  const buildPersistedState = useCallback((): PersistedState => {
    const root = nodes.find(n => n.parentId === null)
    const rootQ = root ? nodeQuestion(root) : ''
    const title = rootQ ? (rootQ.length > 40 ? rootQ.slice(0, 40) + '…' : rootQ) : 'Untitled'
    return {
      version: 1,
      conversation: {
        id: currentConversationId,
        title,
        rootId: root?.id ?? '',
        nodes,
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
      },
      viewport: { offset, scale },
      activeNodeId,
    }
  }, [nodes, offset, scale, activeNodeId, currentConversationId])

  // Load history + the last-active conversation from the server once on mount.
  // Until this resolves we show a loading screen; autosave is gated on it so the
  // empty initial state can't overwrite stored data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { index, active } = await bootstrapFromServer()
        if (cancelled) return
        setIndex(index)
        applyPersisted(active ?? blankPersisted())
      } catch (e) {
        console.error('bootstrap failed', e)
        if (!cancelled) applyPersisted(blankPersisted())
      } finally {
        if (!cancelled) {
          bootstrappedRef.current = true
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyPersisted])

  // Flush the current conversation to storage immediately (before switching away).
  const persistCurrentNow = useCallback(async () => {
    try {
      setIndex(await saveConversation(buildPersistedState()))
      await saveLastActiveId(currentConversationId)
    } catch (e) {
      console.error('persist failed', e)
    }
  }, [buildPersistedState, currentConversationId])

  const switchConversation = useCallback(async (id: string) => {
    setSidebarOpen(false)
    if (id === currentConversationId) return
    await persistCurrentNow()
    const target = await loadConversation(id)
    if (!target) return
    applyPersisted(target)
    await saveLastActiveId(id)
  }, [currentConversationId, persistCurrentNow, applyPersisted])

  const newConversation = useCallback(async () => {
    setSidebarOpen(false)
    // Already on a blank canvas → nothing to create (avoid stray "Untitled" rows).
    if (nodes.length === 0) return
    await persistCurrentNow()
    const fresh = blankPersisted()
    applyPersisted(fresh)
    setIndex(await saveConversation(fresh))
    await saveLastActiveId(fresh.conversation.id)
  }, [nodes.length, persistCurrentNow, applyPersisted])

  const deleteConversationFromHistory = useCallback(async (id: string) => {
    const nextIndex = await deleteConversation(id)
    setIndex(nextIndex)
    if (id !== currentConversationId) return
    // Deleted the open one → fall back to the most recent remaining, else blank.
    const fallback = nextIndex.length > 0 ? await loadConversation(nextIndex[0].id) : null
    const target = fallback ?? blankPersisted()
    applyPersisted(target)
    await saveLastActiveId(target.conversation.id)
  }, [currentConversationId, applyPersisted])

  // Gather a node + all its descendants via breadth-first walk of parentId links.
  const collectSubtree = useCallback((rootId: string): Set<string> => {
    const ids = new Set<string>([rootId])
    const queue = [rootId]
    while (queue.length > 0) {
      const curr = queue.shift()!
      nodes.filter(n => n.parentId === curr).forEach(child => {
        ids.add(child.id)
        queue.push(child.id)
      })
    }
    return ids
  }, [nodes])

  // The × button only opens the themed confirm dialog; deletion happens on confirm.
  const handleDeleteNode = useCallback((nodeId: string) => {
    setPendingDeleteId(nodeId)
  }, [])

  // Delete the node and its entire subtree (cascade) after confirmation.
  const confirmDelete = useCallback((nodeId: string) => {
    const toDelete = collectSubtree(nodeId)
    const parentId = nodes.find(n => n.id === nodeId)?.parentId ?? null

    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
    setStreaming(prev => {
      const next = { ...prev }
      toDelete.forEach(id => delete next[id])
      return next
    })
    // If the selection fell inside the deleted subtree, move it to the surviving
    // parent (or clear it when the root went away).
    setActiveNodeId(curr =>
      curr && toDelete.has(curr)
        ? parentId && !toDelete.has(parentId) ? parentId : null
        : curr
    )
    // Close any open input bar that was targeting a now-deleted node.
    if (pendingInput && toDelete.has(pendingInput.parentId)) {
      setPendingInput(null)
    }
    setPendingDeleteId(null)
  }, [collectSubtree, nodes, pendingInput])

  // ── Card context-menu actions (right-click) ─────────────────────────────────

  // Copy a card into the internal clipboard (its messages only — not its subtree).
  const copyNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node) setClipboard(node.messages.map(m => ({ ...m })))
  }, [nodes])

  // Build a fresh node (new ids) cloning the clipboard's messages verbatim — a true
  // duplicate, no LLM re-run. Returns null when nothing has been copied.
  const nodeFromClipboard = useCallback((parentId: string | null, edgeKind: EdgeKind): ConversationNode | null => {
    if (!clipboard) return null
    const newId = crypto.randomUUID()
    const now = Date.now()
    return {
      id: newId,
      parentId,
      edgeKind,
      messages: clipboard.map((m, i) => ({ ...m, id: `${newId}-${i}`, createdAt: now + i })),
    }
  }, [clipboard])

  // Paste the copied card as a child of the target (continue = below, branch = side).
  const pasteChild = useCallback((targetId: string, edgeKind: EdgeKind) => {
    const n = nodeFromClipboard(targetId, edgeKind)
    if (!n) return
    setNodes(prev => [...prev, n])
    setActiveNodeId(n.id)
  }, [nodeFromClipboard])

  // Paste the copied card as a new PARENT inserted between the target and its old
  // parent. If the target was the root, the pasted card becomes the new root.
  const pasteAbove = useCallback((targetId: string) => {
    const target = nodes.find(n => n.id === targetId)
    if (!target) return
    const n = nodeFromClipboard(target.parentId, target.edgeKind)
    if (!n) return
    setNodes(prev =>
      prev
        .map(x => (x.id === targetId ? { ...x, parentId: n.id, edgeKind: 'continue' as EdgeKind } : x))
        .concat(n)
    )
    setActiveNodeId(n.id)
  }, [nodes, nodeFromClipboard])

  // Edit a card's question, then re-stream its answer for the new question.
  const submitEditQuestion = useCallback((nodeId: string, newQuestion: string) => {
    const nextNodes = nodes.map(n =>
      n.id === nodeId
        ? {
            ...n,
            messages: n.messages.map(m =>
              m.role === 'user'
                ? { ...m, content: newQuestion }
                : m.role === 'assistant'
                  ? { ...m, content: '' }
                  : m
            ),
          }
        : n
    )
    setNodes(nextNodes)
    setEditingNodeId(null)
    setActiveNodeId(nodeId)
    runLLM(nodeId, buildContext(nodeId, nextNodes))
  }, [nodes, runLLM, buildContext])

  // Branch creation
  const handleSubmit = useCallback((question: string) => {
    if (!pendingInput) return
    const parentNode = nodes.find(n => n.id === pendingInput.parentId)
    if (!parentNode) return

    const newId = crypto.randomUUID()
    const newNode = buildExchangeNode(newId, pendingInput.parentId, pendingInput.mode, question)
    const nextNodes = [...nodes, newNode]

    setNodes(nextNodes)
    setActiveNodeId(newId)
    setPendingInput(null)

    runLLM(newId, buildContext(newId, nextNodes))

    // Pan to the new node if it would land off-screen — its position comes from
    // the freshly recomputed layout of the updated tree.
    setTimeout(() => {
      const p = computeLayout(nextNodes).get(newId)
      if (!p) return
      const screenX = p.x * currentScale.current + currentOffset.current.x
      const screenY = p.y * currentScale.current + currentOffset.current.y
      const vw = viewportSize.width
      const vh = viewportSize.height
      if (screenX > vw - 480 || screenX < 80 || screenY > vh - 360 || screenY < 80) {
        setOffset({
          x: vw / 2 - (p.x + NODE_WIDTH / 2) * currentScale.current,
          y: vh / 3 - (p.y + NODE_HEIGHT / 3) * currentScale.current,
        })
      }
    }, 80)
  }, [pendingInput, nodes, viewportSize, buildExchangeNode, runLLM, buildContext])

  // Auto-save the open conversation (debounced) whenever the tree or view changes.
  // Skip a brand-new untouched blank (not yet in history) so it doesn't clutter the
  // list; but DO persist an existing conversation that was just emptied (Clear).
  useEffect(() => {
    if (loading || !bootstrappedRef.current) return
    const handle = window.setTimeout(async () => {
      const known = indexRef.current.some(m => m.id === currentConversationId)
      if (nodes.length === 0 && !known) return
      try {
        setIndex(await saveConversation(buildPersistedState()))
        await saveLastActiveId(currentConversationId)
      } catch (e) {
        console.error('autosave failed', e)
      }
    }, 400)
    return () => window.clearTimeout(handle)
  }, [nodes, offset, scale, activeNodeId, currentConversationId, buildPersistedState, loading])

  // Dot grid background follows pan/zoom
  const dotSpacing = 28 * scale
  const dotOffsetX = ((offset.x % dotSpacing) + dotSpacing) % dotSpacing
  const dotOffsetY = ((offset.y % dotSpacing) + dotSpacing) % dotSpacing

  // While the server bootstrap is in flight, show a minimal branded loader.
  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: '#0c0c10',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <GitBranch size={16} color={ACCENT_MAIN_COLOR} strokeWidth={2} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
          Đang tải…
        </span>
      </div>
    )
  }

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
          <ConnectionLines nodes={positioned} depthMap={depthMap} activePathIds={activePath} />

          {/* Chat nodes */}
          {positioned.map(node => (
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
              onDelete={handleDeleteNode}
              onContextMenu={(id, x, y) => {
                setActiveNodeId(id)
                setContextMenu({ nodeId: id, x, y })
              }}
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
        {/* History sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          title="Lịch sử hội thoại"
          style={{
            pointerEvents: 'auto',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 5,
            background: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.color = ACCENT_MAIN_COLOR
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${ACCENT_MAIN_COLOR}55`
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
          }}
        >
          <PanelLeft size={15} strokeWidth={2} />
        </button>

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
            onClick={() => setConfirmClear(true)}
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
        nodes={positioned}
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

      {/* Input bar — edit a card's question, then re-stream its answer */}
      {editingNodeId && (() => {
        const node = nodes.find(n => n.id === editingNodeId)
        if (!node) return null
        return (
          <InputBar
            mode="edit"
            initialValue={nodeQuestion(node)}
            onSubmit={text => submitEditQuestion(editingNodeId, text)}
            onCancel={() => setEditingNodeId(null)}
          />
        )
      })()}

      {/* Right-click card action menu (copy / paste / edit / delete) */}
      {contextMenu && (() => {
        const node = nodes.find(n => n.id === contextMenu.nodeId)
        if (!node) return null
        return (
          <CardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            accent={getBranchAccent(depthMap.get(node.id) ?? 0)}
            canPaste={clipboard !== null}
            onCopy={() => copyNode(node.id)}
            onPasteAbove={() => pasteAbove(node.id)}
            onPasteBelow={() => pasteChild(node.id, 'continue')}
            onPasteBranch={() => pasteChild(node.id, 'branch')}
            onEdit={() => setEditingNodeId(node.id)}
            onDelete={() => handleDeleteNode(node.id)}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}

      {/* Themed confirm dialog before wiping the whole canvas (main-thread yellow) */}
      {confirmClear && (
        <ConfirmDialog
          accent={getBranchAccent(0)}
          title="Xóa toàn bộ canvas?"
          icon={Trash2}
          confirmLabel="Xóa hết"
          onConfirm={() => {
            handleClear()
            setConfirmClear(false)
          }}
          onCancel={() => setConfirmClear(false)}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12.5,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.55,
            }}
          >
            Toàn bộ <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{nodes.length}</strong> thẻ trên
            canvas sẽ bị xóa vĩnh viễn và bắt đầu lại từ trang trắng. Không thể hoàn tác.
          </p>
        </ConfirmDialog>
      )}

      {/* Themed confirm dialog before deleting a card (and its subtree) */}
      {pendingDeleteId && (() => {
        const deletingNode = nodes.find(n => n.id === pendingDeleteId)
        if (!deletingNode) return null
        return (
          <DeleteConfirm
            node={deletingNode}
            accent={getBranchAccent(depthMap.get(pendingDeleteId) ?? 0)}
            descendantCount={collectSubtree(pendingDeleteId).size - 1}
            onConfirm={() => confirmDelete(pendingDeleteId)}
            onCancel={() => setPendingDeleteId(null)}
          />
        )
      })()}

      {/* Conversation history drawer */}
      <HistorySidebar
        open={sidebarOpen}
        index={index}
        currentId={currentConversationId}
        onClose={() => setSidebarOpen(false)}
        onSelect={switchConversation}
        onNew={newConversation}
        onDelete={setPendingDeleteConvId}
      />

      {/* Themed confirm dialog before deleting a whole conversation (main-thread yellow) */}
      {pendingDeleteConvId && (() => {
        const meta = index.find(m => m.id === pendingDeleteConvId)
        return (
          <ConfirmDialog
            accent={getBranchAccent(0)}
            title="Xóa chủ đề này?"
            icon={Trash2}
            confirmLabel="Xóa"
            onConfirm={() => {
              deleteConversationFromHistory(pendingDeleteConvId)
              setPendingDeleteConvId(null)
            }}
            onCancel={() => setPendingDeleteConvId(null)}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.55,
              }}
            >
              Chủ đề{' '}
              <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                “{meta?.title || 'Untitled'}”
              </strong>{' '}
              cùng <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{meta?.nodeCount ?? 0}</strong> thẻ
              sẽ bị xóa vĩnh viễn khỏi lịch sử. Không thể hoàn tác.
            </p>
          </ConfirmDialog>
        )
      })()}
    </div>
  )
}
