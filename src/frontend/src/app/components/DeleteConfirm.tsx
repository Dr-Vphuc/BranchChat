import { Trash2, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { ConversationNode } from '../lib/types'
import { nodeQuestion, nodeAnswer } from '../lib/utils'
import { CollapsibleQuestion } from './CollapsibleQuestion'
import { ConfirmDialog } from './ConfirmDialog'

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

  return (
    <ConfirmDialog
      accent={accent}
      title="Xóa thẻ này?"
      icon={Trash2}
      confirmLabel="Xóa"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
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
    </ConfirmDialog>
  )
}
