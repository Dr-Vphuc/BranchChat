import { useRef, useEffect, useState } from 'react'
import { Plus, ArrowDown, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { PositionedNode } from '../lib/types'
import { nodeQuestion, nodeAnswer } from '../lib/utils'
import { NODE_WIDTH, NODE_HEIGHT, getBranchAccent } from '../lib/constants'

interface ChatNodeProps {
  node: PositionedNode
  branchDepth: number
  isActive: boolean
  isOnActivePath: boolean
  /** Transient streaming state (not part of the node) — undefined when idle. */
  streaming?: { isTyping: boolean; error?: string }
  onActivate: (id: string) => void
  onBranch: (parentId: string) => void
  onContinue: (parentId: string) => void
  onDelete: (id: string) => void
}

export function ChatNode({
  node,
  branchDepth,
  isActive,
  isOnActivePath,
  streaming,
  onActivate,
  onBranch,
  onContinue,
  onDelete,
}: ChatNodeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const accent = getBranchAccent(branchDepth)

  const question = nodeQuestion(node)
  const answer = nodeAnswer(node)
  const isTyping = streaming?.isTyping ?? false
  const error = streaming?.error

  // Content streams in live, so the message itself is the visible answer.
  const visibleAnswer = answer

  const depthLabel =
    branchDepth === 0
      ? 'main thread'
      : branchDepth === 1
        ? 'branch'
        : `branch · depth ${branchDepth}`

  useEffect(() => {
    if (isTyping && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleAnswer, isTyping])

  return (
    <div
      data-node="true"
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        // Glide to new spots when the auto-layout re-arranges on edits.
        transition: 'left 0.25s ease, top 0.25s ease',
      }}
      onClick={() => onActivate(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 4,
          overflow: 'hidden',
          cursor: 'default',
          transition: 'box-shadow 0.15s ease',
          backgroundColor: branchDepth === 0 ? '#141418' : '#101015',
          borderTop: `1px solid rgba(255,255,255,${isActive ? '0.12' : '0.06'})`,
          borderRight: `1px solid rgba(255,255,255,${isActive ? '0.12' : '0.06'})`,
          borderBottom: `1px solid rgba(255,255,255,${isActive ? '0.12' : '0.06'})`,
          borderLeft: `2px solid ${isOnActivePath ? accent : `${accent}35`}`,
          boxShadow: isActive
            ? `0 0 0 1px ${accent}30, 0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)`
            : isOnActivePath
              ? `0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`
              : `0 2px 8px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '7px 10px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: isOnActivePath ? accent : `${accent}50`,
              transition: 'background-color 0.2s',
            }}
          />
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 9.5,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: isOnActivePath ? `${accent}bb` : 'rgba(255,255,255,0.28)',
              transition: 'color 0.2s',
            }}
          >
            {depthLabel}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8.5,
              color: 'rgba(255,255,255,0.15)',
            }}
          >
            {node.id.slice(0, 7)}
          </span>
        </div>

        {/* Question */}
        <div
          style={{
            flexShrink: 0,
            padding: '9px 11px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.035)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: 'rgba(255,255,255,0.82)',
              lineHeight: 1.52,
            }}
          >
            {question}
          </p>
        </div>

        {/* Answer */}
        <div
          ref={scrollRef}
          data-scrollable="true"
          style={{
            flex: 1,
            padding: '9px 11px 10px',
            overflowY: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {visibleAnswer && (
            <div className="bc-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeHighlight]}
              >
                {visibleAnswer}
              </ReactMarkdown>
            </div>
          )}
          {!visibleAnswer && !error && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5,
                color: 'rgba(255,255,255,0.2)',
                fontStyle: 'italic',
              }}
            >
              Waiting for response...
            </span>
          )}
          {isTyping && (
            <span
              style={{
                display: 'inline-block',
                width: 1.5,
                height: '0.9em',
                backgroundColor: accent,
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                animation: 'bc-cursor-blink 0.75s steps(1) infinite',
              }}
            />
          )}
          {error && (
            <span
              style={{
                display: 'block',
                marginTop: visibleAnswer ? 8 : 0,
                color: '#f87171',
                fontSize: 10.5,
                fontFamily: "'JetBrains Mono', monospace",
                fontStyle: 'italic',
              }}
            >
              ⚠ {error}
            </span>
          )}
        </div>
      </div>

      {/* Delete (×) button — top-right corner, fades in on hover */}
      <button
        data-node="true"
        title="Delete this card and its branches"
        onClick={e => {
          e.stopPropagation()
          onDelete(node.id)
        }}
        style={{
          position: 'absolute',
          top: -10,
          right: -10,
          width: 22,
          height: 22,
          borderRadius: '50%',
          backgroundColor: '#0c0c10',
          borderWidth: 1.5,
          borderStyle: 'solid',
          borderColor: 'rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
          zIndex: 11,
          padding: 0,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(248,113,113,0.15)'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#f87171'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0c0c10'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'
        }}
      >
        <X size={11} strokeWidth={2.5} />
      </button>

      {/* Branch (+) button — right edge, vertically centered */}
      <button
        data-node="true"
        title="Create branch"
        onClick={e => {
          e.stopPropagation()
          onBranch(node.id)
        }}
        style={{
          position: 'absolute',
          right: -14,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 26,
          height: 26,
          borderRadius: '50%',
          backgroundColor: '#0c0c10',
          borderWidth: 1.5,
          borderStyle: 'solid',
          borderColor: isOnActivePath ? `${accent}80` : `${accent}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: isOnActivePath ? accent : `${accent}60`,
          transition: 'all 0.15s ease',
          zIndex: 10,
          padding: 0,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = `${accent}20`
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = accent
          ;(e.currentTarget as HTMLButtonElement).style.color = accent
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0c0c10'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = isOnActivePath
            ? `${accent}80`
            : `${accent}30`
          ;(e.currentTarget as HTMLButtonElement).style.color = isOnActivePath
            ? accent
            : `${accent}60`
        }}
      >
        <Plus size={11} strokeWidth={2.5} />
      </button>

      {/* Continue thread button — bottom center, shows on every node */}
      <button
        data-node="true"
        title="Continue conversation"
        onClick={e => {
          e.stopPropagation()
          onContinue(node.id)
        }}
        style={{
          position: 'absolute',
          bottom: -14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 26,
          height: 26,
          borderRadius: '50%',
          backgroundColor: '#0c0c10',
          borderWidth: 1.5,
          borderStyle: 'solid',
          borderColor: isOnActivePath ? `${accent}80` : `${accent}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: isOnActivePath ? accent : `${accent}60`,
          transition: 'all 0.15s ease',
          zIndex: 10,
          padding: 0,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = `${accent}20`
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = accent
          ;(e.currentTarget as HTMLButtonElement).style.color = accent
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0c0c10'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = isOnActivePath
            ? `${accent}80`
            : `${accent}30`
          ;(e.currentTarget as HTMLButtonElement).style.color = isOnActivePath
            ? accent
            : `${accent}60`
        }}
      >
        <ArrowDown size={11} strokeWidth={2.5} />
      </button>
    </div>
  )
}

