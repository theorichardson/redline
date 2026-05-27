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

const LABEL_GAP = 4;
const VIEWPORT_MARGIN = 6;
const COLLISION_PADDING = 2;
const OBSTACLE_MARGIN = 4;
const MAX_RESOLVE_PASSES = 24;

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

function getPushPreference(side: BoxSide): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

function marginBox(geo: BoxModelGeometry) {
  const { elementRect: r, margin: m } = geo;
  return {
    left: r.left - m.left,
    top: r.top - m.top,
    right: r.right + m.right,
    bottom: r.bottom + m.bottom,
    width: r.width + m.left + m.right,
    height: r.height + m.top + m.bottom,
  };
}

function paddingBox(geo: BoxModelGeometry) {
  const { elementRect: r, border: b } = geo;
  return {
    left: r.left + b.left,
    top: r.top + b.top,
    right: r.right - b.right,
    bottom: r.bottom - b.bottom,
    width: r.width - b.left - b.right,
    height: r.height - b.top - b.bottom,
  };
}

/** Prefer sliding under UI chrome (tooltip) so labels stay near the hovered element. */
function resolveTopAnchorWithObstacles(
  cx: number,
  bandTop: number,
  obstacles: DOMRect[],
): { x: number; y: number; transform: string } {
  const gap = LABEL_GAP;
  let y = bandTop;
  let transform = `translate(-50%, calc(-100% - ${gap}px))`;

  for (const obstacle of obstacles) {
    if (cx < obstacle.left || cx > obstacle.right) continue;
    if (obstacle.bottom > bandTop + 24) continue;

    const below = obstacle.bottom + gap;
    if (below < bandTop) {
      y = below;
      transform = `translate(-50%, 0)`;
    }
  }

  return { x: cx, y, transform };
}

function pushPreferenceForAnchor(
  side: BoxSide,
  transform: string,
): { x: number; y: number } {
  if (side === 'top' && transform.startsWith('translate(-50%, 0)')) {
    return { x: 0, y: 1 };
  }
  return getPushPreference(side);
}

/**
 * Anchor on the outer edge of the band being labelled so the tag sits outside
 * the filled overlay, not over the element content.
 */
export function computeBoxModelLabelAnchor(
  boxType: BoxType,
  side: BoxSide,
  geo: BoxModelGeometry,
  obstacles: DOMRect[] = [],
): { x: number; y: number; transform: string } {
  const gap = LABEL_GAP;

  if (boxType === 'margin') {
    const box = marginBox(geo);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    switch (side) {
      case 'top':
        return resolveTopAnchorWithObstacles(cx, box.top, obstacles);
      case 'bottom':
        return {
          x: cx,
          y: box.bottom,
          transform: `translate(-50%, ${gap}px)`,
        };
      case 'left':
        return {
          x: box.left,
          y: cy,
          transform: `translate(calc(-100% - ${gap}px), -50%)`,
        };
      case 'right':
        return {
          x: box.right,
          y: cy,
          transform: `translate(${gap}px, -50%)`,
        };
    }
  }

  const box = paddingBox(geo);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  switch (side) {
    case 'top':
      return resolveTopAnchorWithObstacles(cx, box.top, obstacles);
    case 'bottom':
      return {
        x: cx,
        y: box.bottom,
        transform: `translate(-50%, ${gap}px)`,
      };
    case 'left':
      return {
        x: box.left,
        y: cy,
        transform: `translate(calc(-100% - ${gap}px), -50%)`,
      };
    case 'right':
      return {
        x: box.right,
        y: cy,
        transform: `translate(${gap}px, -50%)`,
      };
  }
}

/** Place gap labels just outside the gap strip (not centered inside it). */
export function computeGapLabelAnchor(
  region: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
  obstacles: DOMRect[] = [],
): { x: number; y: number; transform: string; side: BoxSide } {
  const gap = LABEL_GAP;
  const cx = region.left + region.width / 2;
  const cy = region.top + region.height / 2;
  const isRowGap = region.width >= region.height;

  if (isRowGap) {
    const anchor = resolveTopAnchorWithObstacles(cx, region.top, obstacles);
    return { ...anchor, side: 'top' };
  }

  return {
    x: region.left,
    y: cy,
    side: 'left',
    transform: `translate(calc(-100% - ${gap}px), -50%)`,
  };
}

interface PlacedLabel {
  el: HTMLElement;
  baseTransform: string;
  preference: { x: number; y: number };
  offsetX: number;
  offsetY: number;
}

function applyLabelTransform(placed: PlacedLabel): void {
  const { offsetX, offsetY, baseTransform } = placed;
  if (offsetX === 0 && offsetY === 0) {
    placed.el.style.transform = baseTransform;
    return;
  }
  placed.el.style.transform = `${baseTransform} translate(${offsetX}px, ${offsetY}px)`;
}

function rectsOverlap(a: DOMRect, b: DOMRect, padding: number): boolean {
  return !(
    a.right + padding <= b.left ||
    a.left - padding >= b.right ||
    a.bottom + padding <= b.top ||
    a.top - padding >= b.bottom
  );
}

function viewportNudge(
  rect: DOMRect,
  preference: { x: number; y: number },
): { dx: number; dy: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let dx = 0;
  let dy = 0;

  if (rect.left < VIEWPORT_MARGIN) {
    dx += VIEWPORT_MARGIN - rect.left;
  }
  if (rect.right > vw - VIEWPORT_MARGIN) {
    dx -= rect.right - (vw - VIEWPORT_MARGIN);
  }
  if (rect.top < VIEWPORT_MARGIN) {
    dy += VIEWPORT_MARGIN - rect.top;
  }
  if (rect.bottom > vh - VIEWPORT_MARGIN) {
    dy -= rect.bottom - (vh - VIEWPORT_MARGIN);
  }

  if (dx !== 0 && preference.x !== 0) {
    dx *= Math.sign(preference.x);
  }
  if (dy !== 0 && preference.y !== 0) {
    dy *= Math.sign(preference.y);
  }

  return { dx, dy };
}

function separationNudge(
  a: DOMRect,
  b: DOMRect,
  prefA: { x: number; y: number },
  prefB: { x: number; y: number },
): { dxA: number; dyA: number; dxB: number; dyB: number } {
  const overlapX =
    Math.min(a.right, b.right) - Math.max(a.left, b.left) + COLLISION_PADDING;
  const overlapY =
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + COLLISION_PADDING;

  if (overlapX <= 0 || overlapY <= 0) {
    return { dxA: 0, dyA: 0, dxB: 0, dyB: 0 };
  }

  if (overlapX <= overlapY) {
    const shift = overlapX / 2;
    const dir = a.left + a.width / 2 <= b.left + b.width / 2 ? -1 : 1;
    const dxA = dir * shift * (prefA.x !== 0 ? Math.sign(prefA.x) || dir : dir);
    const dxB = -dir * shift * (prefB.x !== 0 ? Math.sign(prefB.x) || -dir : -dir);
    return { dxA, dyA: 0, dxB, dyB: 0 };
  }

  const shift = overlapY / 2;
  const dir = a.top + a.height / 2 <= b.top + b.height / 2 ? -1 : 1;
  const dyA = dir * shift * (prefA.y !== 0 ? Math.sign(prefA.y) || dir : dir);
  const dyB = -dir * shift * (prefB.y !== 0 ? Math.sign(prefB.y) || -dir : -dir);
  return { dxA: 0, dyA, dxB: 0, dyB };
}

function inflateRect(rect: DOMRect, margin: number): DOMRect {
  return new DOMRect(
    rect.left - margin,
    rect.top - margin,
    rect.width + margin * 2,
    rect.height + margin * 2,
  );
}

/**
 * Resolve overlap with a fixed obstacle by moving the label along the escape
 * axis that keeps it closest to the hovered element (not farther away).
 */
function obstacleNudgeTowardTarget(
  labelRect: DOMRect,
  obstacle: DOMRect,
  target: DOMRect,
): { dx: number; dy: number } {
  if (!rectsOverlap(labelRect, obstacle, 0)) {
    return { dx: 0, dy: 0 };
  }

  const candidates: Array<{ dx: number; dy: number }> = [];
  const overlapTop = labelRect.bottom - obstacle.top;
  const overlapBottom = obstacle.bottom - labelRect.top;
  const overlapLeft = labelRect.right - obstacle.left;
  const overlapRight = obstacle.right - labelRect.left;

  if (overlapTop > 0) candidates.push({ dx: 0, dy: -overlapTop - COLLISION_PADDING });
  if (overlapBottom > 0) candidates.push({ dx: 0, dy: overlapBottom + COLLISION_PADDING });
  if (overlapLeft > 0) candidates.push({ dx: -overlapLeft - COLLISION_PADDING, dy: 0 });
  if (overlapRight > 0) candidates.push({ dx: overlapRight + COLLISION_PADDING, dy: 0 });

  if (candidates.length === 0) return { dx: 0, dy: 0 };

  const tcx = target.left + target.width / 2;
  const tcy = target.top + target.height / 2;
  let best = candidates[0];
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const newCx = labelRect.left + labelRect.width / 2 + candidate.dx;
    const newCy = labelRect.top + labelRect.height / 2 + candidate.dy;
    const dist = (newCx - tcx) ** 2 + (newCy - tcy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

/** Visible Redline chrome (tooltip host, FAB, onboarding, etc.) that labels must avoid. */
export function collectRedlineUiObstacleRects(extraRects: Array<DOMRect | null | undefined> = []): DOMRect[] {
  const rects: DOMRect[] = [];

  for (const rect of extraRects) {
    if (rect && rect.width > 0 && rect.height > 0) {
      rects.push(inflateRect(rect, OBSTACLE_MARGIN));
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

    rects.push(inflateRect(rect, OBSTACLE_MARGIN));
  });

  return rects;
}

/** Keep labels inside the viewport, away from UI chrome, and separated from each other. */
export function resolveLabelCollisions(
  placed: PlacedLabel[],
  obstacles: DOMRect[] = [],
  targetRect: DOMRect | null = null,
): void {
  if (placed.length === 0) return;

  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    let moved = false;

    for (const label of placed) {
      applyLabelTransform(label);
    }

    for (let i = 0; i < placed.length; i++) {
      const label = placed[i];
      const rect = label.el.getBoundingClientRect();
      const { dx, dy } = viewportNudge(rect, label.preference);
      if (dx !== 0 || dy !== 0) {
        label.offsetX += dx;
        label.offsetY += dy;
        moved = true;
      }
    }

    if (obstacles.length > 0 && targetRect) {
      for (let i = 0; i < placed.length; i++) {
        const label = placed[i];
        const rect = label.el.getBoundingClientRect();

        for (const obstacle of obstacles) {
          const { dx, dy } = obstacleNudgeTowardTarget(rect, obstacle, targetRect);
          if (dx !== 0 || dy !== 0) {
            label.offsetX += dx;
            label.offsetY += dy;
            moved = true;
          }
        }
      }
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const rectA = a.el.getBoundingClientRect();
        const rectB = b.el.getBoundingClientRect();
        if (!rectsOverlap(rectA, rectB, 0)) continue;

        const { dxA, dyA, dxB, dyB } = separationNudge(
          rectA,
          rectB,
          a.preference,
          b.preference,
        );
        if (dxA !== 0 || dyA !== 0 || dxB !== 0 || dyB !== 0) {
          a.offsetX += dxA;
          a.offsetY += dyA;
          b.offsetX += dxB;
          b.offsetY += dyB;
          moved = true;
        }
      }
    }

    if (!moved) break;
  }

  for (const label of placed) {
    applyLabelTransform(label);
  }
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

export interface LabelMountEntry {
  el: HTMLElement;
  anchor: { x: number; y: number; transform: string };
  side: BoxSide;
}

export interface LabelMountBatch {
  container: HTMLElement;
  entries: LabelMountEntry[];
}

/** Mount labels into their layers, then resolve viewport and inter-label collisions together. */
export function mountAndLayoutOverlayLabels(
  batches: LabelMountBatch[],
  obstacles: DOMRect[] = [],
  targetRect: DOMRect | null = null,
): void {
  const placed: PlacedLabel[] = [];

  for (const { container, entries } of batches) {
    if (entries.length === 0) continue;
    container.style.display = 'block';

    for (const { el, anchor, side } of entries) {
      el.style.left = `${anchor.x}px`;
      el.style.top = `${anchor.y}px`;
      container.appendChild(el);
      placed.push({
        el,
        baseTransform: anchor.transform,
        preference: pushPreferenceForAnchor(side, anchor.transform),
        offsetX: 0,
        offsetY: 0,
      });
    }
  }

  resolveLabelCollisions(placed, obstacles, targetRect);
}
