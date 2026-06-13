import { useState, useRef, useEffect } from 'react'
import { GitBranch, ArrowDown, X, CornerDownLeft } from 'lucide-react'
import { NodeData } from '../lib/types'

interface InputBarProps {
  parentNode: NodeData
  mode: 'branch' | 'continue'
  onSubmit: (question: string) => void
  onCancel: () => void
}

export function InputBar({ parentNode, mode, onSubmit, onCancel }: InputBarProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onSubmit(trimmed)
      setValue('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  const canSubmit = value.trim().length > 0
  const isBranch = mode === 'branch'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 290,
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Input panel */}
      <div
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 540,
          maxWidth: 'calc(100vw - 32px)',
          backgroundColor: '#171720',
          border: '1px solid rgba(245, 158, 11, 0.22)',
          borderRadius: 6,
          boxShadow: '0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.08)',
          overflow: 'hidden',
          zIndex: 300,
          animation: 'bc-slide-up 0.18s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Context header */}
        <div
          style={{
            padding: '8px 12px 7px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(0,0,0,0.2)',
          }}
        >
          {isBranch ? (
            <GitBranch size={11} color="#f59e0b" strokeWidth={2} />
          ) : (
            <ArrowDown size={11} color="#f59e0b" strokeWidth={2} />
          )}
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10.5,
              color: 'rgba(255,255,255,0.38)',
            }}
          >
            {isBranch ? 'Branch from:' : 'Continue from:'}
          </span>
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10.5,
              color: 'rgba(255,255,255,0.58)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {parentNode.question.length > 60
              ? parentNode.question.slice(0, 60) + '…'
              : parentNode.question}
          </span>
          <button
            onClick={onCancel}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.28)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
              borderRadius: 3,
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.28)')}
          >
            <X size={12} />
          </button>
        </div>

        {/* Textarea */}
        <div style={{ padding: '12px 14px 6px' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isBranch ? 'Ask a tangential question…' : 'Continue the thread…'}
            rows={3}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.55,
              caretColor: '#f59e0b',
            }}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '4px 12px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9.5,
              color: 'rgba(255,255,255,0.18)',
              letterSpacing: '0.04em',
            }}
          >
            ↵ submit · esc cancel · ⇧↵ newline
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: canSubmit ? '#f59e0b' : 'rgba(245,158,11,0.15)',
              border: 'none',
              borderRadius: 4,
              padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11.5,
              fontWeight: 500,
              color: canSubmit ? '#0c0c10' : 'rgba(245,158,11,0.35)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
              letterSpacing: '0.01em',
            }}
          >
            <CornerDownLeft size={11} strokeWidth={2} />
            {isBranch ? 'Branch' : 'Continue'}
          </button>
        </div>
      </div>
    </>
  )
}
