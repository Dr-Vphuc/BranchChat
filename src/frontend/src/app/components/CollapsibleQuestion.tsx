import { useRef, useEffect, useState } from 'react'

interface CollapsibleQuestionProps {
  question: string
  /** Branch-depth accent used for the toggle link. */
  accent: string
  clampLines?: number
  fontSize?: number
  /** When set, the expanded question scrolls within this height instead of growing freely. */
  expandedMaxHeight?: number
}

// Shows a question clamped to `clampLines`; reveals the rest behind a
// "Xem thêm / Thu gọn" toggle that only appears when text is actually hidden.
export function CollapsibleQuestion({
  question,
  accent,
  clampLines = 3,
  fontSize = 12,
  expandedMaxHeight,
}: CollapsibleQuestionProps) {
  const questionRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)

  // Detect whether the question is longer than the clamp, so the toggle only
  // appears when there's hidden text. Measured while collapsed; the question
  // text never changes mid-stream, so a single pass is accurate.
  useEffect(() => {
    const el = questionRef.current
    if (el) setIsClamped(el.scrollHeight > el.clientHeight + 1)
  }, [question])

  return (
    <div
      style={
        expanded && expandedMaxHeight
          ? { maxHeight: expandedMaxHeight, overflowY: 'auto', scrollbarWidth: 'none' }
          : undefined
      }
    >
      <p
        ref={questionRef}
        style={{
          margin: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize,
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.52,
          ...(expanded
            ? {}
            : {
                display: '-webkit-box',
                WebkitLineClamp: clampLines,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }),
        }}
      >
        {question}
      </p>
      {isClamped && (
        <button
          data-node="true"
          onClick={e => {
            e.stopPropagation()
            setExpanded(v => !v)
          }}
          style={{
            marginTop: 3,
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 10,
            color: `${accent}aa`,
          }}
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  )
}
