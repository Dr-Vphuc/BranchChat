export interface NodeData {
  id: string
  parentId: string | null
  question: string
  answer: string
  x: number
  y: number
  isMainThread: boolean
  branchDepth: number
  isTyping?: boolean
  typingProgress?: number
}

export interface PendingInput {
  parentId: string
  mode: 'branch' | 'continue'
}
