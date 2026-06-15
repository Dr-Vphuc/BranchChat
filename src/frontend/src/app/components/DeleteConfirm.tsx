import { useEffect } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { ConversationNode } from '../lib/types'
import { nodeQuestion, nodeAnswer } from '../lib/utils'
import { CollapsibleQuestion } from './CollapsibleQuestion'

interface DeleteConfirmProps {
  node: ConversationNode
  /** Branch-depth accent of the card being deleted — themes the whole dialog. */
  accent: string
  descendantCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirm({ node, accent, descendantCount, onConfirm, onCancel }: DeleteConfirmProps) {
  const question = nodeQuestion(node)
  const answer = nodeAnswer(node)

  // Esc cancels. Enter is intentionally NOT bound — deletion needs an explicit click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <>
      {/* Backdrop */}
      <div
        data-node="true"
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 290,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      />

      {/* Dialog */}
      <div
        data-node="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 460,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '78vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#171720',
          border: `1px solid ${accent}55`,
          borderRadius: 6,
          boxShadow: `0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px ${accent}1a`,
          overflow: 'hidden',
          zIndex: 300,
          animation: 'bc-slide-up 0.18s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '11px 14px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            backgroundColor: 'rgba(0,0,0,0.2)',
          }}
        >
          <Trash2 size={14} color={accent} strokeWidth={2} />
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13.5,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.88)',
            }}
          >
            Xóa thẻ này?
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          <p
            style={{
              margin: '0 0 11px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.5,
            }}
          >
            Bạn muốn xóa thẻ này chứ? Nội dung dưới đây sẽ biến mất.
          </p>

          {/* Preview of the card being deleted */}
          <div
            style={{
              borderLeft: `2px solid ${accent}`,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 4,
              backgroundColor: '#101015',
              overflow: 'hidden',
            }}
          >
            {/* Preview label */}
            <div
              style={{
                padding: '7px 11px 6px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
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
                  backgroundColor: accent,
                }}
              />
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 9.5,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: `${accent}bb`,
                }}
              >
                Thẻ sẽ bị xóa
              </span>
            </div>

            {/* Question (collapsible, same mechanism as the card) */}
            <div style={{ padding: '9px 11px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <CollapsibleQuestion question={question} accent={accent} expandedMaxHeight={160} />
            </div>

            {/* Answer (scrollable markdown) */}
            <div
              data-node="true"
              data-scrollable="true"
              style={{ padding: '9px 11px 10px', maxHeight: 200, overflowY: 'auto' }}
            >
              {answer ? (
                <div className="bc-md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {answer}
                  </ReactMarkdown>
                </div>
              ) : (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10.5,
                    color: 'rgba(255,255,255,0.2)',
                    fontStyle: 'italic',
                  }}
                >
                  (Chưa có nội dung trả lời)
                </span>
              )}
            </div>
          </div>

          {/* Cascade warning */}
          {descendantCount > 0 && (
            <div
              style={{
                marginTop: 11,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                padding: '8px 10px',
                borderRadius: 4,
                backgroundColor: `${accent}12`,
                border: `1px solid ${accent}33`,
              }}
            >
              <AlertTriangle size={13} color={accent} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,0.62)',
                  lineHeight: 1.45,
                }}
              >
                Thao tác cũng xóa <strong style={{ color: `${accent}dd` }}>{descendantCount}</strong> thẻ con
                bên dưới. Không thể hoàn tác.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            padding: '10px 14px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 4,
              padding: '6px 14px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11.5,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.28)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'
            }}
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: accent,
              border: 'none',
              borderRadius: 4,
              padding: '6px 15px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11.5,
              fontWeight: 600,
              color: '#0c0c10',
              cursor: 'pointer',
              transition: 'filter 0.15s ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.filter = 'none')}
          >
            <Trash2 size={12} strokeWidth={2.5} />
            Xóa
          </button>
        </div>
      </div>
    </>
  )
}
