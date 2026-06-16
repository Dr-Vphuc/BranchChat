import { useEffect } from 'react'
import { Copy, ArrowUp, ArrowDown, GitBranch, Pencil, Trash2, LucideIcon } from 'lucide-react'

interface CardContextMenuProps {
  /** Cursor position (screen space) where the menu opens. */
  x: number
  y: number
  /** Branch-depth accent of the right-clicked card. */
  accent: string
  /** Whether the internal clipboard holds a copied card (enables the paste items). */
  canPaste: boolean
  onCopy: () => void
  onPasteAbove: () => void
  onPasteBelow: () => void
  onPasteBranch: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

const MENU_W = 208
const MENU_H = 250

// Right-click action menu for a single card. Rendered at App level (fixed) so it
// overlays everything and isn't clipped by the pan/zoom world. A transparent
// full-screen backdrop closes it on outside-click; Esc closes too.
export function CardContextMenu({
  x,
  y,
  accent,
  canPaste,
  onCopy,
  onPasteAbove,
  onPasteBelow,
  onPasteBranch,
  onEdit,
  onDelete,
  onClose,
}: CardContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the menu fully on-screen.
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8))

  return (
    <>
      {/* Backdrop — catches the next click anywhere to dismiss. `data-node` keeps
          the click from starting a canvas pan. Right-click also dismisses. */}
      <div
        data-node="true"
        onClick={onClose}
        onContextMenu={e => {
          e.preventDefault()
          onClose()
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 310 }}
      />

      {/* Menu */}
      <div
        data-node="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          left,
          top,
          width: MENU_W,
          backgroundColor: '#171720',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
          padding: 4,
          zIndex: 320,
          animation: 'bc-pop-in 0.12s ease-out',
          transformOrigin: 'top left',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <MenuItem icon={Copy} label="Sao chép" accent={accent} onClick={() => run(onCopy, onClose)} />

        <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 6px' }} />

        <MenuItem
          icon={ArrowUp}
          label="Dán lên trên"
          accent={accent}
          disabled={!canPaste}
          onClick={() => run(onPasteAbove, onClose)}
        />
        <MenuItem
          icon={ArrowDown}
          label="Dán xuống dưới"
          accent={accent}
          disabled={!canPaste}
          onClick={() => run(onPasteBelow, onClose)}
        />
        <MenuItem
          icon={GitBranch}
          label="Dán sang nhánh mới"
          accent={accent}
          disabled={!canPaste}
          onClick={() => run(onPasteBranch, onClose)}
        />

        <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 6px' }} />

        <MenuItem icon={Pencil} label="Sửa câu hỏi" accent={accent} onClick={() => run(onEdit, onClose)} />
        <MenuItem icon={Trash2} label="Xóa" danger onClick={() => run(onDelete, onClose)} />
      </div>
    </>
  )
}

function run(action: () => void, close: () => void) {
  action()
  close()
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  /** Hover accent for normal items. */
  accent?: string
  /** Red theming for destructive items (overrides accent). */
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function MenuItem({ icon: Icon, label, accent, danger, disabled, onClick }: MenuItemProps) {
  const hoverColor = danger ? '#f87171' : 'rgba(255,255,255,0.92)'
  const hoverBg = danger ? 'rgba(248,113,113,0.12)' : `${accent ?? '#ffffff'}1a`
  const baseColor = danger ? '#f8717199' : 'rgba(255,255,255,0.7)'

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 9px',
        background: 'none',
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
        color: disabled ? 'rgba(255,255,255,0.22)' : baseColor,
        textAlign: 'left',
        transition: 'background-color 0.12s ease, color 0.12s ease',
      }}
      onMouseEnter={e => {
        if (disabled) return
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg
        ;(e.currentTarget as HTMLButtonElement).style.color = hoverColor
      }}
      onMouseLeave={e => {
        if (disabled) return
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
        ;(e.currentTarget as HTMLButtonElement).style.color = baseColor
      }}
    >
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
      {label}
    </button>
  )
}
