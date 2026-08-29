export const LAYOUT_BREAKPOINT = 760;

export function layoutModeForWidth(width) {
  return Number(width) >= LAYOUT_BREAKPOINT ? 'unfolded' : 'folded';
}

