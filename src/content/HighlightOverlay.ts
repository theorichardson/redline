import { extractDesignTokenName, formatBoxModelLabel } from './boxModelTokenLabel';
import { Tooltip, createTooltipContent } from './Tooltip';
import { formatElementDisplayName } from './elementDisplayName';
import type { TypographyStyles } from '../shared/types';

export interface HighlightTooltipOpts {
  typography?: TypographyStyles | null;
}

/**
 * Box model values parsed from computed styles
 */
interface BoxModelValues {
  margin: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
  padding: { top: number; right: number; bottom: number; left: number };
}

interface LayoutChild {
  el: Element;
  rect: DOMRect;
}

interface GapRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  gapPx: number;
  kind: 'row' | 'column';
}

/**
 * HighlightOverlay - Renders visual highlight around elements
 * Uses fixed positioning and shows element boundaries
 * Supports box model visualization (margin, border, padding)
 */
export class HighlightOverlay {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private box: HTMLElement;
  private tooltip: Tooltip;
  private frozenIndicator: HTMLElement;

  // Box model overlays
  private marginOverlay: HTMLElement;
  private borderOverlay: HTMLElement;
  private paddingOverlay: HTMLElement;
  private contentOverlay: HTMLElement;

  // Box model labels
  private marginLabels: HTMLElement;
  private paddingLabels: HTMLElement;

  // Flex/grid gap overlays and labels
  private gapOverlays: HTMLElement;
  private gapLabels: HTMLElement;

  // Container for outlines around every direct child of the current
  // element. Populated by `highlightChildren()` (driven by ArrowDown in
  // the inspector) and cleared on any other navigation or hover.
  private childrenContainer: HTMLElement;

  private highlightColor = '#e63946';
  private showBoxModel = false;
  private isFrozen = false;

  // Box model colors — margin (coral / orange tint), border (amber), padding (green)
  private readonly MARGIN_COLOR = 'rgba(255, 155, 120, 0.32)';
  private readonly BORDER_COLOR = 'rgba(255, 212, 120, 0.38)';
  private readonly PADDING_COLOR = 'rgba(120, 200, 140, 0.32)';
  private readonly MARGIN_LABEL_BG = 'rgba(230, 100, 80, 0.95)';
  private readonly PADDING_LABEL_BG = 'rgba(80, 160, 100, 0.95)';
  private readonly GAP_COLOR = 'rgba(190, 165, 230, 0.38)';
  private readonly GAP_LABEL_BG = 'rgba(130, 100, 190, 0.95)';

  constructor() {
    // Create shadow DOM host for style isolation
    this.container = document.createElement('div');
    this.container.setAttribute('data-redline-overlay', 'true');
    this.container.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
    `;
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create box model overlays (margin and padding only - minimal)
    this.marginOverlay = document.createElement('div');
    this.marginOverlay.className = 'box-model-layer margin-layer';

    this.borderOverlay = document.createElement('div');
    this.borderOverlay.className = 'box-model-layer border-layer';

    this.paddingOverlay = document.createElement('div');
    this.paddingOverlay.className = 'box-model-layer padding-layer';

    this.contentOverlay = document.createElement('div');
    this.contentOverlay.className = 'box-model-layer content-layer';

    // Box model labels
    this.marginLabels = document.createElement('div');
    this.marginLabels.className = 'box-labels margin-labels';

    this.paddingLabels = document.createElement('div');
    this.paddingLabels.className = 'box-labels padding-labels';

    this.gapOverlays = document.createElement('div');
    this.gapOverlays.className = 'gap-overlays';

    this.gapLabels = document.createElement('div');
    this.gapLabels.className = 'box-labels gap-labels';

    // Children outlines (filled by highlightChildren / cleared otherwise)
    this.childrenContainer = document.createElement('div');
    this.childrenContainer.className = 'children-outlines';

    // Create simple box overlay (for hover mode)
    this.box = document.createElement('div');
    this.box.className = 'redline-box';

    // Tooltip - unified component
    this.tooltip = new Tooltip();

    // Frozen indicator (shows when CMD is held)
    this.frozenIndicator = document.createElement('div');
    this.frozenIndicator.className = 'frozen-indicator';
    this.frozenIndicator.textContent = '⌘ Frozen';

    // Append in order (back to front)
    this.shadow.appendChild(this.marginOverlay);
    this.shadow.appendChild(this.borderOverlay);
    this.shadow.appendChild(this.paddingOverlay);
    this.shadow.appendChild(this.contentOverlay);
    this.shadow.appendChild(this.marginLabels);
    this.shadow.appendChild(this.paddingLabels);
    this.shadow.appendChild(this.gapOverlays);
    this.shadow.appendChild(this.gapLabels);
    this.shadow.appendChild(this.childrenContainer);
    this.shadow.appendChild(this.box);
    this.shadow.appendChild(this.frozenIndicator);
  }

  private getStyles(): string {
    return `
      .redline-box {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 2px solid ${this.highlightColor};
        border-radius: 2px;
        background: transparent;
        box-sizing: border-box;
        display: none;
      }

      .box-model-layer {
        position: fixed;
        pointer-events: none;
        z-index: 2147483644;
        display: none;
      }

      .margin-layer {
        background: ${this.MARGIN_COLOR};
      }

      .padding-layer {
        background: ${this.PADDING_COLOR};
      }

      .border-layer {
        background: ${this.BORDER_COLOR};
      }

      .content-layer {
        background: transparent;
      }

      .box-labels {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        pointer-events: none;
        z-index: 2147483647;
        display: none;
      }

      .box-label {
        position: absolute;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, monospace;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        color: #fff;
        transform: translate(-50%, -50%);
      }

      .box-label--margin,
      .margin-labels .box-label {
        background: ${this.MARGIN_LABEL_BG};
      }

      .box-label--padding,
      .padding-labels .box-label {
        background: ${this.PADDING_LABEL_BG};
      }

      .gap-overlays {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        pointer-events: none;
        z-index: 2147483645;
        display: none;
      }

      .gap-overlays.visible {
        display: block;
      }

      .gap-layer {
        position: fixed;
        pointer-events: none;
        background: ${this.GAP_COLOR};
        box-sizing: border-box;
      }

      .gap-labels .box-label,
      .box-label--gap {
        background: ${this.GAP_LABEL_BG};
      }

      @keyframes redline-shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-3px); }
        40% { transform: translateX(3px); }
        60% { transform: translateX(-2px); }
        80% { transform: translateX(2px); }
      }

      .redline-box.shake,
      .box-model-layer.shake,
      .box-labels.shake,
      .gap-overlays.shake {
        animation: redline-shake 0.3s ease-in-out;
      }

      /* Frozen state - dashed border to indicate element is locked */
      .redline-box.frozen {
        border-style: dashed;
        border-color: #ffd93d;
      }

      .frozen-indicator {
        position: fixed;
        background: #ffd93d;
        color: #1a1a2e;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        z-index: 2147483647;
        pointer-events: none;
        display: none;
      }

      .frozen-indicator.visible {
        display: block;
      }
    `;
  }

  mount(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }
    // Recreate tooltip if it was destroyed
    if (!this.tooltip) {
      this.tooltip = new Tooltip();
    }
  }

  unmount(): void {
    this.tooltip.destroy();
    this.tooltip = null as any; // Mark as destroyed
    this.container.remove();
  }

  /**
   * Highlight an element - always shows box model with red outline
   */
  highlight(element: Element, tooltipOpts?: HighlightTooltipOpts): void {
    this.showBoxModel = true; // Always show box model
    const rect = element.getBoundingClientRect();

    // Show red outline around the element
    this.box.style.top = `${rect.top}px`;
    this.box.style.left = `${rect.left}px`;
    this.box.style.width = `${rect.width}px`;
    this.box.style.height = `${rect.height}px`;
    this.box.style.display = 'block';

    // Show box model visualization (margin/padding)
    this.showBoxModelOverlay(element, rect);

    // Update tooltip
    this.updateTooltip(element, rect, tooltipOpts);
  }

  /**
   * Parse box model values from computed styles
   */
  private getBoxModelValues(element: Element): BoxModelValues {
    const computed = window.getComputedStyle(element);

    const parse = (value: string) => parseFloat(value) || 0;

    return {
      margin: {
        top: parse(computed.marginTop),
        right: parse(computed.marginRight),
        bottom: parse(computed.marginBottom),
        left: parse(computed.marginLeft),
      },
      border: {
        top: parse(computed.borderTopWidth),
        right: parse(computed.borderRightWidth),
        bottom: parse(computed.borderBottomWidth),
        left: parse(computed.borderLeftWidth),
      },
      padding: {
        top: parse(computed.paddingTop),
        right: parse(computed.paddingRight),
        bottom: parse(computed.paddingBottom),
        left: parse(computed.paddingLeft),
      },
    };
  }

  /**
   * Show the box model visualization overlays (margin and padding as hollow frames)
   */
  private showBoxModelOverlay(element: Element, rect: DOMRect): void {
    const box = this.getBoxModelValues(element);

    // Check if there's any margin to show
    const hasMargin =
      box.margin.top > 0 || box.margin.right > 0 || box.margin.bottom > 0 || box.margin.left > 0;

    if (hasMargin) {
      // Margin box dimensions
      const marginTop = rect.top - box.margin.top;
      const marginLeft = rect.left - box.margin.left;
      const marginWidth = rect.width + box.margin.left + box.margin.right;
      const marginHeight = rect.height + box.margin.top + box.margin.bottom;

      // Use clip-path to create a hollow rectangle (frame)
      // The outer rect is the full margin box, inner rect is the element border box
      const innerTop = box.margin.top;
      const innerLeft = box.margin.left;
      const innerRight = marginWidth - box.margin.right;
      const innerBottom = marginHeight - box.margin.bottom;

      this.marginOverlay.style.top = `${marginTop}px`;
      this.marginOverlay.style.left = `${marginLeft}px`;
      this.marginOverlay.style.width = `${marginWidth}px`;
      this.marginOverlay.style.height = `${marginHeight}px`;
      this.marginOverlay.style.clipPath = `polygon(
        0 0, 100% 0, 100% 100%, 0 100%, 0 0,
        ${innerLeft}px ${innerTop}px,
        ${innerLeft}px ${innerBottom}px,
        ${innerRight}px ${innerBottom}px,
        ${innerRight}px ${innerTop}px,
        ${innerLeft}px ${innerTop}px
      )`;
      this.marginOverlay.style.display = 'block';
    } else {
      this.marginOverlay.style.display = 'none';
    }

    const hasPadding =
      box.padding.top > 0 ||
      box.padding.right > 0 ||
      box.padding.bottom > 0 ||
      box.padding.left > 0;

    const hasBorder =
      box.border.top > 0 || box.border.right > 0 || box.border.bottom > 0 || box.border.left > 0;

    if (hasBorder) {
      const w = rect.width;
      const h = rect.height;
      const bl = box.border.left;
      const bt = box.border.top;
      const br = box.border.right;
      const bb = box.border.bottom;
      const innerW = w - bl - br;
      const innerH = h - bt - bb;

      if (innerW > 0 && innerH > 0) {
        this.borderOverlay.style.top = `${rect.top}px`;
        this.borderOverlay.style.left = `${rect.left}px`;
        this.borderOverlay.style.width = `${w}px`;
        this.borderOverlay.style.height = `${h}px`;
        const il = bl;
        const it = bt;
        const ir = il + innerW;
        const ib = it + innerH;
        this.borderOverlay.style.clipPath = `polygon(
          0 0, 100% 0, 100% 100%, 0 100%, 0 0,
          ${il}px ${it}px,
          ${il}px ${ib}px,
          ${ir}px ${ib}px,
          ${ir}px ${it}px,
          ${il}px ${it}px
        )`;
        this.borderOverlay.style.display = 'block';
      } else {
        this.borderOverlay.style.display = 'none';
      }
    } else {
      this.borderOverlay.style.display = 'none';
    }

    if (hasPadding) {
      // Padding box is inside the border
      const paddingBoxTop = rect.top + box.border.top;
      const paddingBoxLeft = rect.left + box.border.left;
      const paddingBoxWidth = rect.width - box.border.left - box.border.right;
      const paddingBoxHeight = rect.height - box.border.top - box.border.bottom;

      // Content box dimensions (relative to padding box)
      const contentTop = box.padding.top;
      const contentLeft = box.padding.left;
      const contentRight = paddingBoxWidth - box.padding.right;
      const contentBottom = paddingBoxHeight - box.padding.bottom;

      this.paddingOverlay.style.top = `${paddingBoxTop}px`;
      this.paddingOverlay.style.left = `${paddingBoxLeft}px`;
      this.paddingOverlay.style.width = `${paddingBoxWidth}px`;
      this.paddingOverlay.style.height = `${paddingBoxHeight}px`;
      this.paddingOverlay.style.clipPath = `polygon(
        0 0, 100% 0, 100% 100%, 0 100%, 0 0,
        ${contentLeft}px ${contentTop}px,
        ${contentLeft}px ${contentBottom}px,
        ${contentRight}px ${contentBottom}px,
        ${contentRight}px ${contentTop}px,
        ${contentLeft}px ${contentTop}px
      )`;
      this.paddingOverlay.style.display = 'block';
    } else {
      this.paddingOverlay.style.display = 'none';
    }

    this.contentOverlay.style.display = 'none';

    // Update labels
    this.updateBoxModelLabels(element, rect, box);

    this.showGapOverlay(element);
  }

  /**
   * Update the box model labels showing values
   */
  private updateBoxModelLabels(element: Element, rect: DOMRect, box: BoxModelValues): void {
    // Margin labels - positioned outside the element
    const hasMargin =
      box.margin.top > 0 || box.margin.right > 0 || box.margin.bottom > 0 || box.margin.left > 0;

    if (hasMargin) {
      this.marginLabels.innerHTML = '';
      this.marginLabels.style.display = 'block';

      // Use the margin box as reference
      const marginTop = rect.top - box.margin.top;
      const marginLeft = rect.left - box.margin.left;
      const marginWidth = rect.width + box.margin.left + box.margin.right;
      const marginHeight = rect.height + box.margin.top + box.margin.bottom;

      // Top margin label
      if (box.margin.top > 0) {
        this.appendBoxModelLabel(
          this.marginLabels,
          element,
          'margin',
          'top',
          box.margin.top,
          marginLeft + marginWidth / 2,
          marginTop + box.margin.top / 2,
        );
      }

      // Bottom margin label
      if (box.margin.bottom > 0) {
        this.appendBoxModelLabel(
          this.marginLabels,
          element,
          'margin',
          'bottom',
          box.margin.bottom,
          marginLeft + marginWidth / 2,
          rect.bottom + box.margin.bottom / 2,
        );
      }

      // Left margin label
      if (box.margin.left > 0) {
        this.appendBoxModelLabel(
          this.marginLabels,
          element,
          'margin',
          'left',
          box.margin.left,
          marginLeft + box.margin.left / 2,
          marginTop + marginHeight / 2,
        );
      }

      // Right margin label
      if (box.margin.right > 0) {
        this.appendBoxModelLabel(
          this.marginLabels,
          element,
          'margin',
          'right',
          box.margin.right,
          rect.right + box.margin.right / 2,
          marginTop + marginHeight / 2,
        );
      }
    } else {
      this.marginLabels.style.display = 'none';
    }

    // Padding labels - positioned inside the element
    const hasPadding =
      box.padding.top > 0 ||
      box.padding.right > 0 ||
      box.padding.bottom > 0 ||
      box.padding.left > 0;

    if (hasPadding) {
      this.paddingLabels.innerHTML = '';
      this.paddingLabels.style.display = 'block';

      const innerLeft = rect.left + box.border.left;
      const innerTop = rect.top + box.border.top;
      const innerWidth = rect.width - box.border.left - box.border.right;
      const innerHeight = rect.height - box.border.top - box.border.bottom;

      // Top padding label
      if (box.padding.top > 0) {
        this.appendBoxModelLabel(
          this.paddingLabels,
          element,
          'padding',
          'top',
          box.padding.top,
          innerLeft + innerWidth / 2,
          innerTop + box.padding.top / 2,
        );
      }

      // Bottom padding label
      if (box.padding.bottom > 0) {
        const bottomEdge = innerTop + innerHeight;
        this.appendBoxModelLabel(
          this.paddingLabels,
          element,
          'padding',
          'bottom',
          box.padding.bottom,
          innerLeft + innerWidth / 2,
          bottomEdge - box.padding.bottom / 2,
        );
      }

      // Left padding label
      if (box.padding.left > 0) {
        this.appendBoxModelLabel(
          this.paddingLabels,
          element,
          'padding',
          'left',
          box.padding.left,
          innerLeft + box.padding.left / 2,
          innerTop + innerHeight / 2,
        );
      }

      // Right padding label
      if (box.padding.right > 0) {
        const rightEdge = innerLeft + innerWidth;
        this.appendBoxModelLabel(
          this.paddingLabels,
          element,
          'padding',
          'right',
          box.padding.right,
          rightEdge - box.padding.right / 2,
          innerTop + innerHeight / 2,
        );
      }
    } else {
      this.paddingLabels.style.display = 'none';
    }
  }

  /**
   * Create a label element for box model values
   */
  private createBoxModelLabel(
    element: Element,
    boxType: 'margin' | 'padding',
    side: 'top' | 'right' | 'bottom' | 'left',
    pxValue: number,
  ): HTMLElement {
    const isPadding = boxType === 'padding';
    const label = document.createElement('span');
    label.className = isPadding ? 'box-label box-label--padding' : 'box-label box-label--margin';
    label.style.background = isPadding ? this.PADDING_LABEL_BG : this.MARGIN_LABEL_BG;
    label.style.color = '#fff';
    label.textContent = formatBoxModelLabel(element, boxType, side, pxValue);
    return label;
  }

  private appendBoxModelLabel(
    container: HTMLElement,
    element: Element,
    boxType: 'margin' | 'padding',
    side: 'top' | 'right' | 'bottom' | 'left',
    pxValue: number,
    x: number,
    y: number,
  ): void {
    const label = this.createBoxModelLabel(element, boxType, side, pxValue);
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    container.appendChild(label);
    this.clampBoxModelLabelToViewport(label);
  }

  /** Nudge centered box-model labels so they stay fully inside the viewport. */
  private clampBoxModelLabelToViewport(label: HTMLElement, margin = 6): void {
    let offsetX = 0;
    let offsetY = 0;

    for (let pass = 0; pass < 2; pass++) {
      label.style.transform =
        offsetX === 0 && offsetY === 0
          ? 'translate(-50%, -50%)'
          : `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

      const rect = label.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let dx = 0;
      let dy = 0;

      if (rect.right > viewportWidth - margin) {
        dx -= rect.right - (viewportWidth - margin);
      }
      if (rect.left < margin) {
        dx += margin - rect.left;
      }
      if (rect.bottom > viewportHeight - margin) {
        dy -= rect.bottom - (viewportHeight - margin);
      }
      if (rect.top < margin) {
        dy += margin - rect.top;
      }

      if (dx === 0 && dy === 0) break;
      offsetX += dx;
      offsetY += dy;
    }

    if (offsetX !== 0 || offsetY !== 0) {
      label.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    }
  }

  /**
   * Hide box model overlay
   */
  private hideBoxModelOverlay(): void {
    this.marginOverlay.style.display = 'none';
    this.marginOverlay.style.clipPath = 'none';
    this.borderOverlay.style.display = 'none';
    this.borderOverlay.style.clipPath = 'none';
    this.paddingOverlay.style.display = 'none';
    this.paddingOverlay.style.clipPath = 'none';
    this.contentOverlay.style.display = 'none';
    this.marginLabels.style.display = 'none';
    this.paddingLabels.style.display = 'none';
    this.hideGapOverlay();
  }

  /**
   * Resolve the flex/grid container whose gaps should be drawn. Prefer the
   * highlighted element when it is a gap container; otherwise use its parent.
   */
  private resolveGapContainer(element: Element): Element | null {
    const computed = window.getComputedStyle(element);
    if (this.isFlexOrGridDisplay(computed.display)) {
      const rowGap = this.parseGap(computed.rowGap);
      const colGap = this.parseGap(computed.columnGap);
      if (rowGap > 0 || colGap > 0) return element;
    }

    const parent = element.parentElement;
    if (!parent) return null;

    const parentComputed = window.getComputedStyle(parent);
    if (!this.isFlexOrGridDisplay(parentComputed.display)) return null;

    const rowGap = this.parseGap(parentComputed.rowGap);
    const colGap = this.parseGap(parentComputed.columnGap);
    if (rowGap > 0 || colGap > 0) return parent;

    return null;
  }

  private getVisibleLayoutChildren(container: Element): LayoutChild[] {
    return Array.from(container.children)
      .filter((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((el) => ({ el, rect: el.getBoundingClientRect() }));
  }

  private approxMatchesGap(actual: number, expected: number): boolean {
    if (expected <= 0 || actual <= 0) return false;
    return Math.abs(actual - expected) <= Math.max(2, expected * 0.3);
  }

  private groupChildrenIntoRows(children: LayoutChild[], tolerance = 8): LayoutChild[][] {
    if (children.length === 0) return [];

    const sorted = [...children].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    const rows: LayoutChild[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const child = sorted[i];
      const lastRow = rows[rows.length - 1];
      const rowTop = lastRow[0].rect.top;
      if (Math.abs(child.rect.top - rowTop) <= tolerance) {
        lastRow.push(child);
      } else {
        rows.push([child]);
      }
    }

    return rows;
  }

  private pushColumnGapRegion(
    regions: GapRegion[],
    leftRect: DOMRect,
    rightRect: DOMRect,
    colGap: number,
  ): void {
    if (colGap <= 0) return;

    const gapLeft = leftRect.right;
    const gapRight = rightRect.left;
    const gapWidth = gapRight - gapLeft;
    if (!this.approxMatchesGap(gapWidth, colGap)) return;

    const top = Math.max(leftRect.top, rightRect.top);
    const bottom = Math.min(leftRect.bottom, rightRect.bottom);
    if (bottom <= top) return;

    regions.push({
      left: gapLeft,
      top,
      width: gapWidth,
      height: bottom - top,
      gapPx: colGap,
      kind: 'column',
    });
  }

  private pushRowGapRegion(
    regions: GapRegion[],
    topRect: DOMRect,
    bottomRect: DOMRect,
    rowGap: number,
    spanLeft: number,
    spanRight: number,
  ): void {
    if (rowGap <= 0) return;

    const gapTop = topRect.bottom;
    const gapBottom = bottomRect.top;
    const gapHeight = gapBottom - gapTop;
    if (!this.approxMatchesGap(gapHeight, rowGap)) return;

    const left = Math.max(spanLeft, Math.max(topRect.left, bottomRect.left));
    const right = Math.min(spanRight, Math.min(topRect.right, bottomRect.right));
    if (right <= left) {
      regions.push({
        left: spanLeft,
        top: gapTop,
        width: spanRight - spanLeft,
        height: gapHeight,
        gapPx: rowGap,
        kind: 'row',
      });
      return;
    }

    regions.push({
      left,
      top: gapTop,
      width: right - left,
      height: gapHeight,
      gapPx: rowGap,
      kind: 'row',
    });
  }

  private computeFlexGapRegions(
    children: LayoutChild[],
    computed: CSSStyleDeclaration,
    rowGap: number,
    colGap: number,
  ): GapRegion[] {
    const regions: GapRegion[] = [];
    const direction = computed.flexDirection || 'row';
    const isRow = direction.startsWith('row');
    const isReverse = direction.includes('reverse');
    const wrap = computed.flexWrap !== 'nowrap';

    if (isRow) {
      const rows = this.groupChildrenIntoRows(children);
      for (const row of rows) {
        const sorted = [...row].sort((a, b) =>
          isReverse ? b.rect.right - a.rect.right : a.rect.left - b.rect.left,
        );
        for (let i = 0; i < sorted.length - 1; i++) {
          this.pushColumnGapRegion(regions, sorted[i].rect, sorted[i + 1].rect, colGap);
        }
      }

      if (wrap && rows.length > 1 && rowGap > 0) {
        for (let i = 0; i < rows.length - 1; i++) {
          const current = rows[i];
          const next = rows[i + 1];
          const topRect = current.reduce(
            (best, child) => (child.rect.bottom > best.rect.bottom ? child : best),
            current[0],
          ).rect;
          const bottomRect = next.reduce(
            (best, child) => (child.rect.top < best.rect.top ? child : best),
            next[0],
          ).rect;
          const spanLeft = Math.min(...current.map((c) => c.rect.left), ...next.map((c) => c.rect.left));
          const spanRight = Math.max(...current.map((c) => c.rect.right), ...next.map((c) => c.rect.right));
          this.pushRowGapRegion(regions, topRect, bottomRect, rowGap, spanLeft, spanRight);
        }
      }
      return regions;
    }

    const columns = this.groupChildrenIntoColumns(children);
    for (const column of columns) {
      const sorted = [...column].sort((a, b) =>
        isReverse ? b.rect.top - a.rect.top : a.rect.top - b.rect.top,
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        this.pushRowGapRegion(
          regions,
          sorted[i].rect,
          sorted[i + 1].rect,
          rowGap,
          Math.min(sorted[i].rect.left, sorted[i + 1].rect.left),
          Math.max(sorted[i].rect.right, sorted[i + 1].rect.right),
        );
      }
    }

    if (wrap && columns.length > 1 && colGap > 0) {
      for (let i = 0; i < columns.length - 1; i++) {
        const current = columns[i];
        const next = columns[i + 1];
        const leftRect = current.reduce(
          (best, child) => (child.rect.right > best.rect.right ? child : best),
          current[0],
        ).rect;
        const rightRect = next.reduce(
          (best, child) => (child.rect.left < best.rect.left ? child : best),
          next[0],
        ).rect;
        this.pushColumnGapRegion(regions, leftRect, rightRect, colGap);
      }
    }

    return regions;
  }

  private groupChildrenIntoColumns(children: LayoutChild[], tolerance = 8): LayoutChild[][] {
    if (children.length === 0) return [];

    const sorted = [...children].sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    const columns: LayoutChild[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const child = sorted[i];
      const lastColumn = columns[columns.length - 1];
      const columnLeft = lastColumn[0].rect.left;
      if (Math.abs(child.rect.left - columnLeft) <= tolerance) {
        lastColumn.push(child);
      } else {
        columns.push([child]);
      }
    }

    return columns;
  }

  private computeGridGapRegions(
    children: LayoutChild[],
    rowGap: number,
    colGap: number,
  ): GapRegion[] {
    const regions: GapRegion[] = [];
    const rows = this.groupChildrenIntoRows(children);

    for (const row of rows) {
      const sorted = [...row].sort((a, b) => a.rect.left - b.rect.left);
      for (let i = 0; i < sorted.length - 1; i++) {
        this.pushColumnGapRegion(regions, sorted[i].rect, sorted[i + 1].rect, colGap);
      }
    }

    if (rows.length > 1 && rowGap > 0) {
      for (let i = 0; i < rows.length - 1; i++) {
        const current = rows[i];
        const next = rows[i + 1];
        const topRect = current.reduce(
          (best, child) => (child.rect.bottom > best.rect.bottom ? child : best),
          current[0],
        ).rect;
        const bottomRect = next.reduce(
          (best, child) => (child.rect.top < best.rect.top ? child : best),
          next[0],
        ).rect;
        const spanLeft = Math.min(...current.map((c) => c.rect.left), ...next.map((c) => c.rect.left));
        const spanRight = Math.max(...current.map((c) => c.rect.right), ...next.map((c) => c.rect.right));
        this.pushRowGapRegion(regions, topRect, bottomRect, rowGap, spanLeft, spanRight);
      }
    }

    return regions;
  }

  private computeGapRegions(container: Element): GapRegion[] {
    const computed = window.getComputedStyle(container);
    if (!this.isFlexOrGridDisplay(computed.display)) return [];

    const rowGap = this.parseGap(computed.rowGap);
    const colGap = this.parseGap(computed.columnGap);
    if (rowGap <= 0 && colGap <= 0) return [];

    const children = this.getVisibleLayoutChildren(container);
    if (children.length < 2) return [];

    if (computed.display.includes('grid')) {
      return this.computeGridGapRegions(children, rowGap, colGap);
    }

    return this.computeFlexGapRegions(children, computed, rowGap, colGap);
  }

  private formatGapLabel(container: Element, gapPx: number, kind: 'row' | 'column'): string {
    const computed = window.getComputedStyle(container);
    const raw =
      kind === 'row'
        ? computed.rowGap || computed.gap
        : computed.columnGap || computed.gap;
    const token =
      extractDesignTokenName(raw) ??
      extractDesignTokenName(computed.gap) ??
      extractDesignTokenName(computed.rowGap) ??
      extractDesignTokenName(computed.columnGap);
    const rounded = Math.round(gapPx);
    if (token) return `${token} (${rounded}px)`;
    return `${rounded}`;
  }

  private showGapOverlay(element: Element): void {
    const container = this.resolveGapContainer(element);
    if (!container) {
      this.hideGapOverlay();
      return;
    }

    const regions = this.computeGapRegions(container);
    if (regions.length === 0) {
      this.hideGapOverlay();
      return;
    }

    this.gapOverlays.innerHTML = '';
    this.gapLabels.innerHTML = '';

    for (const region of regions) {
      const overlay = document.createElement('div');
      overlay.className = 'gap-layer';
      overlay.style.top = `${region.top}px`;
      overlay.style.left = `${region.left}px`;
      overlay.style.width = `${region.width}px`;
      overlay.style.height = `${region.height}px`;
      this.gapOverlays.appendChild(overlay);

      const label = document.createElement('span');
      label.className = 'box-label box-label--gap';
      label.style.background = this.GAP_LABEL_BG;
      label.style.color = '#fff';
      label.textContent = this.formatGapLabel(container, region.gapPx, region.kind);
      label.style.left = `${region.left + region.width / 2}px`;
      label.style.top = `${region.top + region.height / 2}px`;
      this.gapLabels.appendChild(label);
      this.clampBoxModelLabelToViewport(label);
    }

    this.gapOverlays.classList.add('visible');
    this.gapLabels.style.display = 'block';
  }

  private hideGapOverlay(): void {
    this.gapOverlays.innerHTML = '';
    this.gapOverlays.classList.remove('visible');
    this.gapLabels.innerHTML = '';
    this.gapLabels.style.display = 'none';
  }

  /**
   * Parse a computed `row-gap` / `column-gap` value to a rounded pixel number.
   * Returns 0 for "normal" or unparseable values (which is how the layout
   * engine treats them anyway).
   */
  private parseGap(value: string): number {
    if (!value || value === 'normal') return 0;
    const n = parseFloat(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n);
  }

  private isFlexOrGridDisplay(display: string): boolean {
    // Tolerant of cross-browser quirks (e.g. "-webkit-flex").
    return /(^|\s)(inline-)?(flex|grid)(\s|$)/.test(display);
  }

  private formatGap(rowGap: number, colGap: number): string {
    return rowGap === colGap ? `${rowGap}px` : `${rowGap}px / ${colGap}px`;
  }

  /**
   * Build the gap tooltip entry for the hovered element. Looks at the
   * element itself first (when it's a flex/grid container), then falls
   * back to its parent (when the hovered element is an item inside a
   * flex/grid container) so that hovering a card in a grid still tells
   * the user the inter-item spacing rule.
   */
  private computeGapForTooltip(
    element: Element,
    computed: CSSStyleDeclaration,
  ): { label: string; value: string } | null {
    // Case 1: this element IS a flex/grid container with non-zero gap.
    if (this.isFlexOrGridDisplay(computed.display)) {
      const rowGap = this.parseGap(computed.rowGap);
      const colGap = this.parseGap(computed.columnGap);
      if (rowGap > 0 || colGap > 0) {
        return { label: 'gap:', value: this.formatGap(rowGap, colGap) };
      }
    }

    // Case 2: parent is a flex/grid container with non-zero gap.
    const parent = element.parentElement;
    if (parent) {
      const parentComputed = window.getComputedStyle(parent);
      if (this.isFlexOrGridDisplay(parentComputed.display)) {
        const rowGap = this.parseGap(parentComputed.rowGap);
        const colGap = this.parseGap(parentComputed.columnGap);
        if (rowGap > 0 || colGap > 0) {
          return {
            label: 'parent gap:',
            value: this.formatGap(rowGap, colGap),
          };
        }
      }
    }

    return null;
  }

  /** First font face from computed stack + truncation for single-line tooltip */
  private truncateFontFamilyForTooltip(family: string, maxChars = 44): string {
    const raw = family.split(',')[0]?.trim() ?? family;
    const stripped =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
    if (stripped.length <= maxChars) return stripped;
    return stripped.slice(0, Math.max(1, maxChars - 1)) + '…';
  }

  private updateTooltip(element: Element, rect: DOMRect, tooltipOpts?: HighlightTooltipOpts): void {
    const elementName = formatElementDisplayName(element);

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const parts: Array<{ label?: string; value: string }> = [
      { value: elementName },
      { value: `${width} × ${height}` },
    ];

    const t = tooltipOpts?.typography;
    if (t) {
      parts.push({ label: 'font-size:', value: t.fontSize });
      parts.push({ label: 'font:', value: this.truncateFontFamilyForTooltip(t.fontFamily) });
      if (t.lineHeight && t.lineHeight !== 'normal') {
        parts.push({ label: 'lh:', value: t.lineHeight });
      }
    }

    // Gap (flex / grid). Shown for the hovered element when IT is the
    // flex/grid container with a non-zero gap; OR for the hovered element
    // when its PARENT is a flex/grid container with a non-zero gap (so
    // that hovering an item in a grid still tells you the spacing rule
    // between it and its siblings, labeled "parent gap" to avoid confusion).
    const computed = window.getComputedStyle(element);
    const gapInfo = this.computeGapForTooltip(element, computed);
    if (gapInfo) {
      parts.push(gapInfo);
    }

    // Create tooltip content with formatted parts (same structure as default)
    const content = createTooltipContent(parts);

    // Calculate target rect including margin if showing box model
    let targetRect = rect;
    if (this.showBoxModel) {
      const marginTop = parseFloat(computed.marginTop) || 0;
      const marginBottom = parseFloat(computed.marginBottom) || 0;
      const marginLeft = parseFloat(computed.marginLeft) || 0;
      const marginRight = parseFloat(computed.marginRight) || 0;

      targetRect = new DOMRect(
        rect.left - marginLeft,
        rect.top - marginTop,
        rect.width + marginLeft + marginRight,
        rect.height + marginTop + marginBottom
      );
    }

    // Show tooltip with smart positioning
    this.tooltip.showSmart({
      content,
      targetRect,
      preferredPosition: 'top',
      size: 'medium',
      variant: 'dark'
    });
  }

  hide(): void {
    this.box.style.display = 'none';
    this.tooltip.hide();
    this.frozenIndicator.classList.remove('visible');
    this.box.classList.remove('frozen');
    this.hideBoxModelOverlay();
    this.clearChildrenHighlight();
  }

  /**
   * Draw a thin outline around every passed-in element simultaneously.
   * Used by ArrowDown so the user can see the layout of all direct
   * children of the currently-selected container at once, rather than
   * drilling into a single child.
   */
  highlightChildren(children: Element[]): void {
    this.clearChildrenHighlight();
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const outline = document.createElement('div');
      outline.className = 'child-outline';
      outline.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 1.5px dashed ${this.highlightColor};
        background: rgba(230, 57, 70, 0.08);
        pointer-events: none;
        box-sizing: border-box;
        z-index: 2147483645;
      `;
      this.childrenContainer.appendChild(outline);
    }
  }

  /**
   * Remove all child outlines drawn by highlightChildren().
   */
  clearChildrenHighlight(): void {
    this.childrenContainer.innerHTML = '';
  }

  setColor(color: string): void {
    this.highlightColor = color;
    this.box.style.borderColor = color;
  }

  /**
   * Shake the highlight to indicate bounds reached
   */
  shake(): void {
    // Add shake class to all visible elements
    const elements = [
      this.box,
      this.marginOverlay,
      this.borderOverlay,
      this.paddingOverlay,
      this.marginLabels,
      this.paddingLabels,
      this.gapOverlays,
      this.gapLabels,
    ];

    elements.forEach((el) => {
      el.classList.remove('shake'); // Reset if already shaking
      // Force reflow to restart animation
      void el.offsetWidth;
      el.classList.add('shake');
    });

    // Remove class after animation completes
    setTimeout(() => {
      elements.forEach((el) => el.classList.remove('shake'));
    }, 300);
  }

  /**
   * Set the frozen state (when CMD is held to lock element selection)
   */
  setFrozen(frozen: boolean): void {
    if (this.isFrozen === frozen) return; // No change
    this.isFrozen = frozen;
    
    if (frozen) {
      this.box.classList.add('frozen');
      this.frozenIndicator.classList.add('visible');
      
      // Position the frozen indicator near the box
      const boxTop = parseFloat(this.box.style.top) || 0;
      const boxLeft = parseFloat(this.box.style.left) || 0;
      const boxWidth = parseFloat(this.box.style.width) || 0;
      
      // Position at top-right of the box
      this.frozenIndicator.style.top = `${boxTop - 24}px`;
      this.frozenIndicator.style.left = `${boxLeft + boxWidth - 60}px`;
      
      // Ensure it stays in viewport
      const viewportWidth = window.innerWidth;
      const indicatorLeft = parseFloat(this.frozenIndicator.style.left);
      if (indicatorLeft + 60 > viewportWidth) {
        this.frozenIndicator.style.left = `${viewportWidth - 68}px`;
      }
      if (indicatorLeft < 8) {
        this.frozenIndicator.style.left = '8px';
      }
      if (boxTop < 32) {
        this.frozenIndicator.style.top = `${boxTop + parseFloat(this.box.style.height) + 8}px`;
      }
    } else {
      this.box.classList.remove('frozen');
      this.frozenIndicator.classList.remove('visible');
    }
  }
}
