import { Tooltip, createTooltipContent } from './Tooltip';
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
        pointer-events: none;
        z-index: 2147483647;
        display: none;
      }

      .box-label {
        position: absolute;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, monospace;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 5px;
        border-radius: 3px;
        white-space: nowrap;
      }

      .margin-labels .box-label {
        background: rgba(230, 100, 80, 0.95);
        color: #fff;
      }

      .padding-labels .box-label {
        background: rgba(80, 160, 100, 0.95);
        color: #fff;
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
      .box-labels.shake {
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
    this.updateBoxModelLabels(rect, box);
  }

  /**
   * Update the box model labels showing values
   */
  private updateBoxModelLabels(rect: DOMRect, box: BoxModelValues): void {
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
        const label = this.createLabel(Math.round(box.margin.top));
        label.style.top = `${marginTop + box.margin.top / 2 - 8}px`;
        label.style.left = `${marginLeft + marginWidth / 2 - 12}px`;
        this.marginLabels.appendChild(label);
      }

      // Bottom margin label
      if (box.margin.bottom > 0) {
        const label = this.createLabel(Math.round(box.margin.bottom));
        label.style.top = `${rect.bottom + box.margin.bottom / 2 - 8}px`;
        label.style.left = `${marginLeft + marginWidth / 2 - 12}px`;
        this.marginLabels.appendChild(label);
      }

      // Left margin label
      if (box.margin.left > 0) {
        const label = this.createLabel(Math.round(box.margin.left));
        label.style.top = `${marginTop + marginHeight / 2 - 8}px`;
        label.style.left = `${marginLeft + box.margin.left / 2 - 12}px`;
        this.marginLabels.appendChild(label);
      }

      // Right margin label
      if (box.margin.right > 0) {
        const label = this.createLabel(Math.round(box.margin.right));
        label.style.top = `${marginTop + marginHeight / 2 - 8}px`;
        label.style.left = `${rect.right + box.margin.right / 2 - 12}px`;
        this.marginLabels.appendChild(label);
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
        const label = this.createLabel(Math.round(box.padding.top), true);
        label.style.top = `${innerTop + box.padding.top / 2 - 8}px`;
        label.style.left = `${innerLeft + innerWidth / 2 - 12}px`;
        this.paddingLabels.appendChild(label);
      }

      // Bottom padding label
      if (box.padding.bottom > 0) {
        const label = this.createLabel(Math.round(box.padding.bottom), true);
        const bottomEdge = innerTop + innerHeight;
        label.style.top = `${bottomEdge - box.padding.bottom / 2 - 8}px`;
        label.style.left = `${innerLeft + innerWidth / 2 - 12}px`;
        this.paddingLabels.appendChild(label);
      }

      // Left padding label
      if (box.padding.left > 0) {
        const label = this.createLabel(Math.round(box.padding.left), true);
        label.style.top = `${innerTop + innerHeight / 2 - 8}px`;
        label.style.left = `${innerLeft + box.padding.left / 2 - 12}px`;
        this.paddingLabels.appendChild(label);
      }

      // Right padding label
      if (box.padding.right > 0) {
        const label = this.createLabel(Math.round(box.padding.right), true);
        const rightEdge = innerLeft + innerWidth;
        label.style.top = `${innerTop + innerHeight / 2 - 8}px`;
        label.style.left = `${rightEdge - box.padding.right / 2 - 12}px`;
        this.paddingLabels.appendChild(label);
      }
    } else {
      this.paddingLabels.style.display = 'none';
    }
  }

  /**
   * Create a label element for box model values
   */
  private createLabel(value: number, _isPadding = false): HTMLElement {
    const label = document.createElement('span');
    label.className = 'box-label';
    label.textContent = `${value}`;
    return label;
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
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Build element name (tag + id + classes)
    let elementName = `<${tag}>`;
    if (id) elementName += id;
    if (classes) elementName += classes;

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
