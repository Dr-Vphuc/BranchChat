export const NODE_WIDTH = 380
export const NODE_HEIGHT = 248
export const WORLD_WIDTH = 3600
export const WORLD_HEIGHT = 2800
export const MAIN_GAP_Y = 88
export const BRANCH_GAP_X = 120
export const BRANCH_SPACING_Y = 60

export const ACCENT_MAIN = '#f59e0b'
export const ACCENT_BRANCH_1 = '#60a5fa'
export const ACCENT_BRANCH_2 = '#a78bfa'
export const ACCENT_BRANCH_3 = '#34d399'

export function getBranchAccent(depth: number): string {
  if (depth === 0) return ACCENT_MAIN
  if (depth === 1) return ACCENT_BRANCH_1
  if (depth === 2) return ACCENT_BRANCH_2
  return ACCENT_BRANCH_3
}
