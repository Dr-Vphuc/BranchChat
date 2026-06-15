import { useEffect, ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface ConfirmDialogProps {
  /** Accent color theming the border, icon and confirm button. */
  accent: string
  title: string
  /** Optional icon shown in the header and on the confirm button. */
  icon?: LucideIcon
  confirmLabel: string
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

// Themed confirm modal shell (backdrop + centered panel + footer actions).
// Esc cancels; Enter is intentionally unbound so destructive actions need a click.
export function ConfirmDialog({ accent, title, icon: Icon, confirmLabel, children, onConfirm, onCancel }: ConfirmDialogProps) {
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
          animation: 'bc-pop-in 0.16s ease-out',
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
          {Icon && <Icon size={14} color={accent} strokeWidth={2} />}
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13.5,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.88)',
            }}
          >
            {title}
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>{children}</div>

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
            {Icon && <Icon size={12} strokeWidth={2.5} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
