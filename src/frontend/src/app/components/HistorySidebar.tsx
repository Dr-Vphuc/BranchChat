import { useState } from 'react'
import { History, Plus, Search, X } from 'lucide-react'
import { ConversationMeta } from '../lib/types'
import { ACCENT_MAIN } from '../lib/constants'
import { formatRelativeTime } from '../lib/utils'

interface HistorySidebarProps {
  open: boolean
  /** Conversation metadata, already sorted most-recent first. */
  index: ConversationMeta[]
  /** Id of the conversation currently open on the canvas. */
  currentId: string
  onClose: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

// Left drawer listing past conversations with title-search and a "new" button.
// Always mounted; slides in/out via translateX so the open/close animates.
export function HistorySidebar({
  open,
  index,
  currentId,
  onClose,
  onSelect,
  onNew,
  onDelete,
}: HistorySidebarProps) {
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? index.filter(m => (m.title || 'Untitled').toLowerCase().includes(q))
    : index

  return (
    <>
      {/* Backdrop — only when open, so closed drawer doesn't block the canvas */}
      {open && (
        <div
          data-node="true"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 280,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* Drawer */}
      <div
        data-node="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 300,
          zIndex: 285,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#121218',
          borderRight: `1px solid ${ACCENT_MAIN}33`,
          boxShadow: open ? '8px 0 44px rgba(0,0,0,0.55)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '12px 12px 10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <History size={14} color={ACCENT_MAIN} strokeWidth={2} />
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.02em',
            }}
          >
            Lịch sử
          </span>
          <button
            onClick={onClose}
            title="Đóng"
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 4,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)')}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* New + Search */}
        <div
          style={{
            flexShrink: 0,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <button
            onClick={onNew}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: ACCENT_MAIN,
              border: 'none',
              borderRadius: 5,
              padding: '8px 12px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: '#0c0c10',
              cursor: 'pointer',
              transition: 'filter 0.15s ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.filter = 'none')}
          >
            <Plus size={14} strokeWidth={2.5} />
            Chủ đề mới
          </button>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={12}
              color="rgba(255,255,255,0.3)"
              strokeWidth={2}
              style={{ position: 'absolute', left: 9, pointerEvents: 'none' }}
            />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm theo tiêu đề..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 9px 7px 28px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 5,
                outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.85)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = `${ACCENT_MAIN}55`)}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>
        </div>

        {/* List */}
        <div
          data-scrollable="true"
          style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.28)',
              }}
            >
              {index.length === 0 ? 'Chưa có chủ đề nào' : 'Không tìm thấy'}
            </div>
          ) : (
            filtered.map(m => {
              const active = m.id === currentId
              const hovered = hoveredId === m.id
              return (
                <div
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    position: 'relative',
                    padding: '8px 26px 8px 10px',
                    marginBottom: 3,
                    borderRadius: 5,
                    cursor: 'pointer',
                    borderLeft: `2px solid ${active ? ACCENT_MAIN : 'transparent'}`,
                    backgroundColor: active
                      ? `${ACCENT_MAIN}14`
                      : hovered
                        ? 'rgba(255,255,255,0.04)'
                        : 'transparent',
                    transition: 'background-color 0.12s ease',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      color: active ? `${ACCENT_MAIN}ee` : 'rgba(255,255,255,0.78)',
                      lineHeight: 1.35,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }}
                  >
                    {m.title || 'Untitled'}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9.5,
                      color: 'rgba(255,255,255,0.3)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {formatRelativeTime(m.updatedAt)} · {m.nodeCount} thẻ
                  </div>

                  {hovered && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        onDelete(m.id)
                      }}
                      title="Xóa chủ đề này"
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.35)',
                        cursor: 'pointer',
                        transition: 'color 0.15s ease, background-color 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
                        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(248,113,113,0.12)'
                      }}
                      onMouseLeave={e => {
                        ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)'
                        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                      }}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}