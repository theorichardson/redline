export type BoxSide = 'top' | 'right' | 'bottom' | 'left';
export type BoxType = 'margin' | 'padding';

export interface BoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxModelGeometry {
  elementRect: DOMRect;
  margin: BoxEdges;
  border: BoxEdges;
  padding: BoxEdges;
}

export interface BoxModelLabelSpec {
  boxType: BoxType;
  side: BoxSide;
  pxValue: number;
}

/** Distance between a label and the band edge it annotates. */
const LABEL_GAP = 4;
/** Keep labels at least this far from the browser viewport edges. */
const VIEWPORT_MARGIN = 6;

// Scoring weights for candidate placements. Penalties are expressed in "px²"
// of overlap so they compose naturally; side-order and distance terms are tuned
// to be small relative to a meaningful overlap so they only break near-ties.
const W_VIEWPORT = 8; // overflowing the viewport is the worst outcome
const W_OBSTACLE = 5; // overlapping Redline UI chrome (tooltip, FAB, etc.)
const W_LABEL = 4; // overlapping another measurement label
const W_DISTANCE = 0.04; // gentle pull toward the hovered element
const SIDE_PENALTY_OPPOSITE = 40; // mild cost to flip to the opposite side
const SIDE_PENALTY_PERPENDICULAR = 160; // larger cost to escape sideways

const OPPOSITE_SIDE: Record<BoxSide, BoxSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** When every side shares the same rounded value, show one label instead of four. */
export function getSidesToShow(edges: BoxEdges): BoxSide[] {
  const sides: BoxSide[] = ['top', 'right', 'bottom', 'left'];
  if (!sides.some((side) => edges[side] > 0)) return [];

  const rounded = sides.map((side) => Math.round(edges[side]));
  if (rounded.every((value) => value === rounded[0])) {
    return ['top'];
  }

  return sides.filter((side) => edges[side] > 0);
}

export function buildBoxModelLabelSpecs(
  boxType: BoxType,
  edges: BoxEdges,
): BoxModelLabelSpec[] {
  return getSidesToShow(edges).map((side) => ({
    boxType,
    side,
    pxValue: edges[side],
  }));
}

function rectFrom(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function marginBox(geo: BoxModelGeometry): DOMRect {
  const { elementRect: r, margin: m } = geo;
  return rectFrom(
    r.left - m.left,
    r.top - m.top,
    r.width + m.left + m.right,
    r.height + m.top + m.bottom,
  );
}

function paddingBox(geo: BoxModelGeometry): DOMRect {
  const { elementRect: r, border: b } = geo;
  return rectFrom(
    r.left + b.left,
    r.top + b.top,
    r.width - b.left - b.right,
    r.height - b.top - b.bottom,
  );
}

/** The band rect (outer boundary) a margin/padding label should sit against. */
export function boxModelBandRect(boxType: BoxType, geo: BoxModelGeometry): DOMRect {
  return boxType === 'margin' ? marginBox(geo) : paddingBox(geo);
}

/** The rect of a flex/grid gap strip a label should sit against. */
export function gapBandRect(region: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return rectFrom(region.left, region.top, region.width, region.height);
}

/**
 * Row gaps (wide, short strips between stacked items) read best with the label
 * above them. Column gaps (tall, narrow strips between items in a row) should
 * sit below the row — placing them left/right covers the adjacent icon/content.
 */
export function gapPreferredSide(region: { width: number; height: number }): BoxSide {
  return region.width >= region.height ? 'top' : 'bottom';
}

function inflateRect(rect: DOMRect, margin: number): DOMRect {
  return rectFrom(
    rect.left - margin,
    rect.top - margin,
    rect.width + margin * 2,
    rect.height + margin * 2,
  );
}

function intersectionArea(a: DOMRect, b: DOMRect): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

/** Area of `rect` that falls outside the visible viewport. */
function outsideViewportArea(rect: DOMRect, vw: number, vh: number): number {
  const visibleX = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const visibleY = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const total = Math.max(0, rect.width) * Math.max(0, rect.height);
  return Math.max(0, total - visibleX * visibleY);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

/**
 * Build the rect for a label placed on `side` of `band`, sliding along the
 * cross axis so it stays within the viewport without leaving the band.
 */
function buildCandidate(
  side: BoxSide,
  band: DOMRect,
  w: number,
  h: number,
  vw: number,
  vh: number,
): DOMRect {
  const cx = band.left + band.width / 2;
  const cy = band.top + band.height / 2;
  let left: number;
  let top: number;

  switch (side) {
    case 'top':
      left = cx - w / 2;
      top = band.top - LABEL_GAP - h;
      break;
    case 'bottom':
      left = cx - w / 2;
      top = band.bottom + LABEL_GAP;
      break;
    case 'left':
      left = band.left - LABEL_GAP - w;
      top = cy - h / 2;
      break;
    case 'right':
      left = band.right + LABEL_GAP;
      top = cy - h / 2;
      break;
  }

  // Slide along the axis parallel to the band edge to stay on screen.
  if (side === 'top' || side === 'bottom') {
    left = clamp(left, VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - w);
  } else {
    top = clamp(top, VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - h);
  }

  return rectFrom(left, top, w, h);
}

/** Translate a rect fully inside the viewport as a last-resort safety net. */
function clampRectIntoViewport(rect: DOMRect, vw: number, vh: number): DOMRect {
  let { left, top } = rect;
  const { width: w, height: h } = rect;

  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  else if (left + w > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - w;

  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
  else if (top + h > vh - VIEWPORT_MARGIN) top = vh - VIEWPORT_MARGIN - h;

  return rectFrom(Math.max(0, left), Math.max(0, top), w, h);
}

function sideOrderPenalty(side: BoxSide, preferred: BoxSide): number {
  if (side === preferred) return 0;
  if (side === OPPOSITE_SIDE[preferred]) return SIDE_PENALTY_OPPOSITE;
  return SIDE_PENALTY_PERPENDICULAR;
}

function candidateSides(preferred: BoxSide): BoxSide[] {
  const opposite = OPPOSITE_SIDE[preferred];
  const perpendicular: BoxSide[] =
    preferred === 'top' || preferred === 'bottom' ? ['right', 'left'] : ['bottom', 'top'];
  return [preferred, opposite, ...perpendicular];
}

function scoreCandidate(
  rect: DOMRect,
  side: BoxSide,
  preferred: BoxSide,
  obstacles: DOMRect[],
  placed: DOMRect[],
  vw: number,
  vh: number,
  targetRect: DOMRect | null,
): number {
  let score = sideOrderPenalty(side, preferred);
  score += outsideViewportArea(rect, vw, vh) * W_VIEWPORT;

  for (const obstacle of obstacles) {
    score += intersectionArea(rect, obstacle) * W_OBSTACLE;
  }
  for (const other of placed) {
    score += intersectionArea(rect, other) * W_LABEL;
  }

  if (targetRect) {
    const tcx = targetRect.left + targetRect.width / 2;
    const tcy = targetRect.top + targetRect.height / 2;
    const rcx = rect.left + rect.width / 2;
    const rcy = rect.top + rect.height / 2;
    score += Math.hypot(rcx - tcx, rcy - tcy) * W_DISTANCE;
  }

  return score;
}

/** Visible Redline chrome (tooltip host, FAB, onboarding, etc.) that labels must avoid. */
export function collectRedlineUiObstacleRects(
  extraRects: Array<DOMRect | null | undefined> = [],
): DOMRect[] {
  const rects: DOMRect[] = [];

  for (const rect of extraRects) {
    if (rect && rect.width > 0 && rect.height > 0) {
      rects.push(rect);
    }
  }

  document.querySelectorAll('[data-redline-ui]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('data-redline-overlay')) return;

    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    rects.push(rect);
  });

  return rects;
}

export interface LabelMountEntry {
  el: HTMLElement;
  /** Band/region rect the label annotates, in viewport coordinates. */
  band: DOMRect;
  /** Natural side to place the label on. */
  side: BoxSide;
}

export interface LabelMountBatch {
  container: HTMLElement;
  entries: LabelMountEntry[];
}

interface MeasuredLabel extends LabelMountEntry {
  w: number;
  h: number;
}

/**
 * Mount labels into their layers and place each one intelligently: pick the
 * side (preferred, opposite, then perpendicular) whose rect best avoids the
 * viewport edges, Redline UI chrome, and other labels, then clamp into view.
 */
export function mountAndLayoutOverlayLabels(
  batches: LabelMountBatch[],
  obstacles: DOMRect[] = [],
  targetRect: DOMRect | null = null,
): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Mount first so we can measure each label's rendered size.
  const items: MeasuredLabel[] = [];
  for (const { container, entries } of batches) {
    if (entries.length === 0) continue;
    container.style.display = 'block';

    for (const { el, band, side } of entries) {
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.transform = 'none';
      container.appendChild(el);
      const size = el.getBoundingClientRect();
      items.push({ el, band, side, w: size.width, h: size.height });
    }
  }

  if (items.length === 0) return;

  // Inflate obstacles slightly so labels keep a small breathing gap.
  const paddedObstacles = obstacles.map((o) => inflateRect(o, LABEL_GAP));

  const placedRects: DOMRect[] = [];
  for (const item of items) {
    let best: DOMRect | null = null;
    let bestScore = Infinity;

    for (const side of candidateSides(item.side)) {
      const rect = buildCandidate(side, item.band, item.w, item.h, vw, vh);
      const score = scoreCandidate(
        rect,
        side,
        item.side,
        paddedObstacles,
        placedRects,
        vw,
        vh,
        targetRect,
      );
      if (score < bestScore) {
        bestScore = score;
        best = rect;
      }
    }

    const finalRect = clampRectIntoViewport(best ?? item.band, vw, vh);
    item.el.style.left = `${finalRect.left}px`;
    item.el.style.top = `${finalRect.top}px`;
    item.el.style.transform = 'none';
    placedRects.push(finalRect);
  }
}
