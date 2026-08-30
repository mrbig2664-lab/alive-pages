export const LAYOUT_BREAKPOINT = 760;
export const FOLDED_ASPECT_RATIO = 1.2;

export function layoutModeForWidth(width) {
  return Number(width) >= LAYOUT_BREAKPOINT ? 'unfolded' : 'folded';
}

export function layoutModeForViewport(width, height) {
  const viewportWidth = Number(width);
  const viewportHeight = Number(height);
  if (viewportHeight > viewportWidth * FOLDED_ASPECT_RATIO) return 'folded';
  return layoutModeForWidth(viewportWidth);
}
