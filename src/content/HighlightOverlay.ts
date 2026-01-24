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
  private tooltip: HTMLElement;

  // Box model overlays
  private marginOverlay: HTMLElement;
  private borderOverlay: HTMLElement;
  private paddingOverlay: HTMLElement;
  private contentOverlay: HTMLElement;

  // Box model labels
  private marginLabels: HTMLElement;
  private paddingLabels: HTMLElement;

  private highlightColor = '#e63946';
  private showBoxModel = false;

  // Box model colors - very subtle, doesn't obscure content
  private readonly MARGIN_COLOR = 'rgba(255, 155, 120, 0.25)';
  private readonly PADDING_COLOR = 'rgba(120, 200, 140, 0.25)';

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

    // Create simple box overlay (for hover mode)
    this.box = document.createElement('div');
    this.box.className = 'redline-box';

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'redline-tooltip';

    // Append in order (back to front)
    this.shadow.appendChild(this.marginOverlay);
    this.shadow.appendChild(this.borderOverlay);
    this.shadow.appendChild(this.paddingOverlay);
    this.shadow.appendChild(this.contentOverlay);
    this.shadow.appendChild(this.marginLabels);
    this.shadow.appendChild(this.paddingLabels);
    this.shadow.appendChild(this.box);
    this.shadow.appendChild(this.tooltip);
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

      /* Border and content layers are transparent - we just use red outline */
      .border-layer,
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

      .redline-tooltip {
        position: fixed;
        background: #1a1a2e;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        white-space: nowrap;
        z-index: 2147483647;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        pointer-events: none;
        display: none;
      }

      .redline-tooltip .tag {
        color: #ff6b9d;
      }

      .redline-tooltip .id {
        color: #ffd93d;
      }

      .redline-tooltip .class {
        color: #6bcf7f;
      }

      .redline-tooltip .dims {
        color: #8b8b9a;
        margin-left: 8px;
      }
    `;
  }

  mount(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
      console.log('[Redline] Overlay mounted');
    }
  }

  unmount(): void {
    this.container.remove();
  }

  /**
   * Highlight an element - always shows box model with red outline
   */
  highlight(element: Element, _showBoxModel = true): void {
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
    this.updateTooltip(element, rect);
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

    // Check if there's any padding to show
    const hasPadding =
      box.padding.top > 0 ||
      box.padding.right > 0 ||
      box.padding.bottom > 0 ||
      box.padding.left > 0;

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

    // Hide unused overlays
    this.borderOverlay.style.display = 'none';
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
    this.borderOverlay.style.display = 'none';
    this.paddingOverlay.style.display = 'none';
    this.contentOverlay.style.display = 'none';
    this.marginLabels.style.display = 'none';
    this.paddingLabels.style.display = 'none';
  }

  private updateTooltip(element: Element, rect: DOMRect): void {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    this.tooltip.innerHTML = `
      <span class="tag">&lt;${tag}&gt;</span>${id ? `<span class="id">${id}</span>` : ''}${classes ? `<span class="class">${classes}</span>` : ''}
      <span class="dims">${width} × ${height}</span>
    `;

    // Position tooltip above element (accounting for margin if showing box model)
    const tooltipHeight = 30;
    let tooltipTop: number;

    if (this.showBoxModel) {
      const computed = window.getComputedStyle(element);
      const marginTop = parseFloat(computed.marginTop) || 0;
      tooltipTop = rect.top - marginTop - tooltipHeight - 8;
    } else {
      tooltipTop = rect.top - tooltipHeight - 8;
    }

    const useTop = tooltipTop > 0;

    this.tooltip.style.left = `${rect.left}px`;
    this.tooltip.style.top = useTop ? `${tooltipTop}px` : `${rect.bottom + 8}px`;
    this.tooltip.style.display = 'block';
  }

  hide(): void {
    this.box.style.display = 'none';
    this.tooltip.style.display = 'none';
    this.hideBoxModelOverlay();
  }

  setColor(color: string): void {
    this.highlightColor = color;
    this.box.style.borderColor = color;
  }
}
